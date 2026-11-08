/**
 * Dropout-Risk Service (DB I/O).
 *
 * Boundary: this file may READ any table but may only WRITE riskFlag, counsellorTask and auditLog.
 * Enforced by __tests__/risk-service.test.ts (isolation block).
 */

import { Prisma } from "@prisma/client";
import type { RiskStatus, TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toISTCalendarDateString } from "@/modules/ledger/date-utils";
import {
    RISK_CONFIG,
    buildFeatures,
    buildLlmPayload,
    decideFlagAction,
    renderExplanation,
    scoreRisk,
    validateLlmExplanation,
} from "./risk-math";
import type {
    EvaluationOutcome,
    FalseFlagReason,
    FeatureVector,
    RiskConfig,
    RiskRawInput,
    RiskReason,
    RiskResult,
    RiskRunSummary,
    StaffActor,
    TaskPriority,
    Tier,
} from "./types";

const ZERO = BigInt(0);
const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RISK_ROLES = new Set(["ADMIN", "COUNSELLOR"]);

const istMidnight = (date: string) => new Date(`${date}T00:00:00+05:30`);
const addIstDays = (date: string, days: number) => new Date(istMidnight(date).getTime() + days * DAY_MS);
const toJson = (value: unknown) => value as Prisma.InputJsonValue;

export class RiskError extends Error {
    constructor(message: string, public readonly statusCode = 400) {
        super(message);
        this.name = "RiskError";
    }
}

function resolveAsOf(input?: Date | string): string {
    if (input === undefined) return toISTCalendarDateString(new Date());
    if (typeof input === "string") {
        if (!ISO_DATE.test(input)) throw new RiskError("asOf must be YYYY-MM-DD.", 400);
        return input;
    }
    return toISTCalendarDateString(input);
}

function assertRiskRole(actor: StaffActor): void {
    if (!RISK_ROLES.has(actor.role)) {
        throw new RiskError("Forbidden: risk data is limited to counsellors and admins.", 403);
    }
}

/** Counsellors are pinned to their own centre; admins may filter or see all. */
function centreScope(actor: StaffActor, requested?: string): string | undefined {
    assertRiskRole(actor);
    if (actor.role === "COUNSELLOR") {
        if (!actor.centreId) throw new RiskError("Your account has no centre assigned.", 403);
        return actor.centreId;
    }
    return requested || undefined;
}

function canAccessCentre(actor: StaffActor, centreId: string): boolean {
    return actor.role === "ADMIN" || actor.centreId === centreId;
}

// ---------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------

async function loadStudents(where: Prisma.StudentWhereInput, asOf: string, cfg: RiskConfig) {
    const end = addIstDays(asOf, 1);
    const start = addIstDays(asOf, -(cfg.attendance.lookbackDays + 1));

    return prisma.student.findMany({
        where,
        orderBy: { id: "asc" },
        select: {
            id: true,
            status: true,
            batch: { select: { id: true, centreId: true } },
            enrollments: {
                select: {
                    instalments: {
                        select: {
                            id: true,
                            dueDate: true,
                            amountPaise: true,
                            graceDays: true,
                            allocations: { select: { amountPaise: true } },
                        },
                    },
                },
            },
            attendance: {
                where: { date: { gte: start, lt: end } },
                select: { date: true, present: true },
            },
            testScores: {
                where: { date: { lt: end } },
                orderBy: { date: "desc" },
                take: cfg.academic.maxTests,
                select: { date: true, score: true, maxScore: true },
            },
        },
    });
}

type LoadedStudent = Awaited<ReturnType<typeof loadStudents>>[number];

function toRawInput(s: LoadedStudent): RiskRawInput {
    return {
        instalments: s.enrollments.flatMap((e) =>
            e.instalments.map((i) => ({
                id: i.id,
                dueDate: i.dueDate,
                amountPaise: i.amountPaise,
                paidPaise: i.allocations.reduce((sum, a) => sum + a.amountPaise, ZERO),
                graceDays: i.graceDays,
            }))
        ),
        attendance: s.attendance,
        tests: s.testScores,
    };
}

function scoreLoaded(s: LoadedStudent, asOf: string, cfg: RiskConfig) {
    const features = buildFeatures(toRawInput(s), asOf, cfg);
    return { features, result: scoreRisk(features, cfg) };
}

// ---------------------------------------------------------------------
// Explanation (template first; LLM optional)
// ---------------------------------------------------------------------

async function requestLlmExplanation(reasons: RiskReason[]): Promise<string | null> {
    const provider = (process.env.RISK_LLM_PROVIDER ?? "mock").toLowerCase();
    if (provider === "mock" || provider === "none") return null;

    const payload = buildLlmPayload(reasons);
    // Plug a real provider in here. Send `payload` only; it contains no personal data.
    throw new Error(
        `RISK_LLM_PROVIDER "${provider}" is not implemented (payload ${payload.promptVersion}, ${payload.reasons.length} reasons).`
    );
}

async function explain(reasons: RiskReason[]): Promise<{ text: string; source: "TEMPLATE" | "LLM" }> {
    const template = renderExplanation(reasons);
    if (reasons.length === 0) return { text: template, source: "TEMPLATE" };

    try {
        const candidate = await requestLlmExplanation(reasons);
        if (candidate !== null) {
            const check = validateLlmExplanation(candidate, reasons);
            if (check.ok) return { text: candidate.trim(), source: "LLM" };
            console.warn("[Risk] LLM explanation rejected:", check.problems.join(", "));
        }
    } catch (err) {
        console.warn("[Risk] LLM explanation failed:", err instanceof Error ? err.message : err);
    }
    return { text: template, source: "TEMPLATE" };
}

// ---------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------

async function createTask(
    tx: Prisma.TransactionClient,
    s: LoadedStudent,
    flagId: string,
    result: RiskResult,
    explanation: string,
    asOf: string,
    cfg: RiskConfig
): Promise<string> {
    const assignee = await tx.user.findFirst({
        where: { role: "COUNSELLOR", centreId: s.batch.centreId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true },
    });

    const task = await tx.counsellorTask.create({
        data: {
            studentId: s.id,
            flagId,
            assigneeId: assignee?.id ?? null,
            dueDate: addIstDays(asOf, cfg.taskDueDays),
            status: "OPEN",
            notes: `Risk ${result.tier} (score ${result.score}). ${explanation}`,
        },
        select: { id: true },
    });

    await tx.auditLog.create({
        data: {
            actorId: null,
            action: "COUNSELLOR_TASK_CREATED",
            entityType: "CounsellorTask",
            entityId: task.id,
            beforeState: Prisma.JsonNull,
            afterState: toJson({ flagId, assigneeId: assignee?.id ?? null, tier: result.tier }),
        },
    });

    return task.id;
}

async function persistEvaluation(
    s: LoadedStudent,
    features: FeatureVector,
    result: RiskResult,
    asOf: string,
    cfg: RiskConfig
): Promise<EvaluationOutcome> {
    const explanation = await explain(result.reasons); // network stays outside the transaction

    return prisma.$transaction(async (tx) => {
        // Serialise evaluations per student so two runs can't both create an OPEN flag.
        await tx.$queryRaw`SELECT id FROM students WHERE id = ${s.id} FOR UPDATE`;

        const open = await tx.riskFlag.findFirst({
            where: { studentId: s.id, status: "OPEN" },
            orderBy: { createdAt: "desc" },
            select: { id: true, tier: true, score: true, modelVersion: true },
        });
        const lastFalse = await tx.riskFlag.findFirst({
            where: { studentId: s.id, status: "FALSE_FLAG", reviewedAt: { not: null } },
            orderBy: { reviewedAt: "desc" },
            select: { score: true, reviewedAt: true },
        });

        const decision = decideFlagAction(
            result,
            open ? { tier: open.tier, score: open.score } : null,
            lastFalse?.reviewedAt ? { score: lastFalse.score, reviewedAt: lastFalse.reviewedAt } : null,
            asOf,
            cfg
        );

        if (decision.action === "NONE") {
            return { studentId: s.id, result, decision, flagId: open?.id ?? null, taskId: null };
        }

        const flagData = {
            score: result.score,
            tier: result.tier,
            reasonsJson: toJson(result.reasons),
            featuresJson: toJson(features),
            modelVersion: result.modelVersion,
            asOfDate: istMidnight(asOf),
            explanation: explanation.text,
            explanationSource: explanation.source,
        };
        const auditAfter = toJson({
            score: result.score,
            tier: result.tier,
            modelVersion: result.modelVersion,
            asOf,
            reasonCodes: result.reasons.map((r) => r.code),
        });

        let flagId: string;
        if (decision.action === "CREATE") {
            const flag = await tx.riskFlag.create({
                data: { ...flagData, studentId: s.id, status: "OPEN" },
                select: { id: true },
            });
            flagId = flag.id;
            await tx.auditLog.create({
                data: {
                    actorId: null,
                    action: "RISK_FLAG_CREATED",
                    entityType: "RiskFlag",
                    entityId: flagId,
                    beforeState: Prisma.JsonNull,
                    afterState: auditAfter,
                },
            });
        } else {
            flagId = open!.id;
            await tx.riskFlag.update({ where: { id: flagId }, data: flagData });
            await tx.auditLog.create({
                data: {
                    actorId: null,
                    action: "RISK_FLAG_ESCALATED",
                    entityType: "RiskFlag",
                    entityId: flagId,
                    beforeState: toJson({ score: open!.score, tier: open!.tier, modelVersion: open!.modelVersion }),
                    afterState: auditAfter,
                },
            });
        }

        let taskId: string | null = null;
        if (result.tier === "HIGH") {
            const existingTask = await tx.counsellorTask.findFirst({
                where: { flagId, status: { in: ["OPEN", "IN_PROGRESS"] } },
                select: { id: true },
            });
            if (!existingTask) {
                taskId = await createTask(tx, s, flagId, result, explanation.text, asOf, cfg);
            }
        }

        return { studentId: s.id, result, decision, flagId, taskId };
    });
}

// ---------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------

export class RiskService {
    /** Read-only: computes the score without writing anything. */
    static async scoreStudent(studentId: string, asOfInput?: Date | string) {
        const asOf = resolveAsOf(asOfInput);
        const [student] = await loadStudents({ id: studentId }, asOf, RISK_CONFIG);
        if (!student) throw new RiskError("Student not found.", 404);

        const { features, result } = scoreLoaded(student, asOf, RISK_CONFIG);
        return { studentId: student.id, asOf, features, result, explanation: renderExplanation(result.reasons) };
    }

    static async evaluateStudent(studentId: string, asOfInput?: Date | string): Promise<EvaluationOutcome> {
        const asOf = resolveAsOf(asOfInput);
        const [student] = await loadStudents({ id: studentId }, asOf, RISK_CONFIG);
        if (!student) throw new RiskError("Student not found.", 404);
        if (student.status !== "ACTIVE") throw new RiskError("Only ACTIVE students are evaluated.", 409);

        const { features, result } = scoreLoaded(student, asOf, RISK_CONFIG);
        return persistEvaluation(student, features, result, asOf, RISK_CONFIG);
    }

    /** Called by the daily cron. One student's failure never stops the run. */
    static async runDailyEvaluation(runDate: Date | string): Promise<RiskRunSummary> {
        const asOf = resolveAsOf(runDate);
        const students = await loadStudents({ status: "ACTIVE" }, asOf, RISK_CONFIG);

        const summary: RiskRunSummary = {
            asOf,
            modelVersion: RISK_CONFIG.version,
            evaluated: 0,
            created: 0,
            escalated: 0,
            unchanged: 0,
            cooldown: 0,
            tasksCreated: 0,
            failed: [],
        };

        for (const student of students) {
            try {
                const { features, result } = scoreLoaded(student, asOf, RISK_CONFIG);
                const outcome = await persistEvaluation(student, features, result, asOf, RISK_CONFIG);
                summary.evaluated += 1;
                if (outcome.decision.action === "CREATE") summary.created += 1;
                else if (outcome.decision.action === "ESCALATE") summary.escalated += 1;
                else if (outcome.decision.reason === "COOLDOWN") summary.cooldown += 1;
                else summary.unchanged += 1;
                if (outcome.taskId) summary.tasksCreated += 1;
            } catch (err) {
                summary.failed.push({
                    studentId: student.id,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }

        return summary;
    }

    static async listFlags(
        actor: StaffActor,
        filters: { status?: RiskStatus; tier?: Tier; centreId?: string; limit?: number } = {}
    ) {
        const centreId = centreScope(actor, filters.centreId);

        return prisma.riskFlag.findMany({
            where: {
                status: filters.status ?? "OPEN",
                ...(filters.tier ? { tier: filters.tier } : {}),
                ...(centreId ? { student: { batch: { centreId } } } : {}),
            },
            orderBy: [{ score: "desc" }, { createdAt: "asc" }],
            take: Math.min(Math.max(filters.limit ?? 100, 1), 500),
            select: {
                id: true,
                score: true,
                tier: true,
                status: true,
                explanation: true,
                explanationSource: true,
                reasonsJson: true,
                modelVersion: true,
                asOfDate: true,
                createdAt: true,
                reviewedAt: true,
                reviewReason: true,
                student: {
                    select: {
                        id: true,
                        name: true,
                        batch: { select: { id: true, name: true, centre: { select: { id: true, name: true } } } },
                    },
                },
                counsellorTasks: {
                    select: { id: true, status: true, dueDate: true, assignee: { select: { id: true, name: true } } },
                },
            },
        });
    }

    static async reviewFlag(
        flagId: string,
        actor: StaffActor,
        input: { status: "CONFIRMED" | "FALSE_FLAG"; reason?: FalseFlagReason; note?: string }
    ) {
        assertRiskRole(actor);
        if (input.status === "FALSE_FLAG" && !input.reason) {
            throw new RiskError("A reason is required when marking a flag as FALSE_FLAG.", 400);
        }

        return prisma.$transaction(async (tx) => {
            const flag = await tx.riskFlag.findUnique({
                where: { id: flagId },
                select: { id: true, student: { select: { batch: { select: { centreId: true } } } } },
            });
            // 404 (not 403) for out-of-scope flags, so IDs can't be probed across centres.
            if (!flag || !canAccessCentre(actor, flag.student.batch.centreId)) {
                throw new RiskError("Risk flag not found.", 404);
            }

            const reviewedAt = new Date();
            const updated = await tx.riskFlag.updateMany({
                where: { id: flagId, status: "OPEN" },
                data: {
                    status: input.status,
                    reviewedBy: actor.id,
                    reviewedAt,
                    reviewReason: input.reason ?? null,
                    reviewNote: input.note ?? null,
                },
            });
            if (updated.count === 0) throw new RiskError("Risk flag has already been reviewed.", 409);

            let dismissedTasks = 0;
            if (input.status === "FALSE_FLAG") {
                const res = await tx.counsellorTask.updateMany({
                    where: { flagId, status: { in: ["OPEN", "IN_PROGRESS"] } },
                    data: { status: "DISMISSED" },
                });
                dismissedTasks = res.count;
            }

            await tx.auditLog.create({
                data: {
                    actorId: actor.id,
                    action: "RISK_FLAG_REVIEWED",
                    entityType: "RiskFlag",
                    entityId: flagId,
                    beforeState: toJson({ status: "OPEN" }),
                    afterState: toJson({ status: input.status, reason: input.reason ?? null, dismissedTasks }),
                },
            });

            return { id: flagId, status: input.status, reviewedAt, reviewReason: input.reason ?? null, dismissedTasks };
        });
    }

    static async getMetrics(actor: StaffActor, opts: { centreId?: string; outcomeWindowDays?: number } = {}) {
        const centreId = centreScope(actor, opts.centreId);
        const windowDays = opts.outcomeWindowDays ?? 60;
        const studentScope: Prisma.StudentWhereInput = centreId ? { batch: { centreId } } : {};

        const flags = await prisma.riskFlag.findMany({
            where: centreId ? { student: studentScope } : {},
            select: {
                status: true,
                tier: true,
                createdAt: true,
                studentId: true,
                student: {
                    select: {
                        status: true,
                        leftOn: true,
                        batch: { select: { centre: { select: { id: true, name: true } } } },
                    },
                },
            },
        });

        const leftStudents = await prisma.student.findMany({
            where: { ...studentScope, status: "LEFT", leftOn: { not: null } },
            select: { id: true, leftOn: true, riskFlags: { select: { createdAt: true } } },
        });

        const byStatus = { OPEN: 0, CONFIRMED: 0, FALSE_FLAG: 0 };
        const openByTier = { LOW: 0, MEDIUM: 0, HIGH: 0 };
        const centres = new Map<string, { centreId: string; centreName: string; confirmed: number; falseFlags: number }>();
        const flaggedThenLeft = new Set<string>();

        for (const f of flags) {
            byStatus[f.status] += 1;
            if (f.status === "OPEN") openByTier[f.tier] += 1;

            const c = f.student.batch.centre;
            const bucket = centres.get(c.id) ?? { centreId: c.id, centreName: c.name, confirmed: 0, falseFlags: 0 };
            if (f.status === "CONFIRMED") bucket.confirmed += 1;
            if (f.status === "FALSE_FLAG") bucket.falseFlags += 1;
            centres.set(c.id, bucket);

            const left = f.student.leftOn;
            if (f.student.status === "LEFT" && left) {
                const gap = left.getTime() - f.createdAt.getTime();
                if (gap >= 0 && gap <= windowDays * DAY_MS) flaggedThenLeft.add(f.studentId);
            }
        }

        const leftWithoutFlag = leftStudents.filter(
            (s) => !s.riskFlags.some((fl) => fl.createdAt.getTime() <= s.leftOn!.getTime())
        ).length;

        const reviewed = byStatus.CONFIRMED + byStatus.FALSE_FLAG;
        const rate = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : null);

        return {
            modelVersion: RISK_CONFIG.version,
            totals: { ...byStatus, openByTier },
            counsellorPrecisionPct: rate(byStatus.CONFIRMED, reviewed),
            outcomes: {
                windowDays,
                leftStudents: leftStudents.length,
                flaggedThenLeft: flaggedThenLeft.size,
                leftWithoutFlag,
            },
            byCentre: [...centres.values()].map((c) => ({
                ...c,
                falseFlagRatePct: rate(c.falseFlags, c.confirmed + c.falseFlags),
            })),
        };
    }

    static async listTasks(actor: StaffActor, filters: { status?: TaskStatus; mine?: boolean } = {}) {
        const centreId = centreScope(actor);

        const tasks = await prisma.counsellorTask.findMany({
            where: {
                status: filters.status ?? { in: ["OPEN", "IN_PROGRESS"] },
                ...(filters.mine ? { assigneeId: actor.id } : {}),
                ...(centreId ? { student: { batch: { centreId } } } : {}),
            },
            take: 500,
            select: {
                id: true,
                status: true,
                dueDate: true,
                notes: true,
                createdAt: true,
                updatedAt: true,
                student: {
                    select: {
                        id: true,
                        name: true,
                        batch: { select: { id: true, name: true } },
                    },
                },
                assignee: { select: { id: true, name: true } },
                riskFlag: { select: { id: true, tier: true, score: true, explanation: true } },
            },
        });

        const priorityOrder: Record<TaskPriority, number> = {
            High: 1,
            Medium: 2,
            Normal: 3,
        };

        const mapped = tasks.map((t) => {
            const priority: TaskPriority =
                t.riskFlag?.tier === "HIGH"
                    ? "High"
                    : t.riskFlag?.tier === "MEDIUM"
                    ? "Medium"
                    : "Normal";

            return {
                ...t,
                priority,
            };
        });

        // Default sort: priority (High first), then dueDate ascending, then createdAt ascending
        mapped.sort((a, b) => {
            const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
            if (pDiff !== 0) return pDiff;
            const dDiff = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
            if (dDiff !== 0) return dDiff;
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        });

        return mapped;
    }

    static async updateTask(
        taskId: string,
        actor: StaffActor,
        input: { status?: TaskStatus; notes?: string; assigneeId?: string | null }
    ) {
        assertRiskRole(actor);

        return prisma.$transaction(async (tx) => {
            const task = await tx.counsellorTask.findUnique({
                where: { id: taskId },
                select: {
                    id: true,
                    status: true,
                    assigneeId: true,
                    notes: true,
                    student: { select: { batch: { select: { centreId: true } } } },
                },
            });
            if (!task || !canAccessCentre(actor, task.student.batch.centreId)) {
                throw new RiskError("Task not found.", 404);
            }

            if (input.assigneeId) {
                const assignee = await tx.user.findUnique({
                    where: { id: input.assigneeId },
                    select: { role: true, centreId: true },
                });
                const validRole = assignee && (assignee.role === "COUNSELLOR" || assignee.role === "ADMIN");
                const sameCentre =
                    assignee?.role === "ADMIN" || assignee?.centreId === task.student.batch.centreId;
                if (!validRole || !sameCentre) {
                    throw new RiskError("Assignee must be a counsellor at the student's centre, or an admin.", 400);
                }
            }

            const updated = await tx.counsellorTask.update({
                where: { id: taskId },
                data: {
                    ...(input.status ? { status: input.status } : {}),
                    ...(input.notes !== undefined ? { notes: input.notes } : {}),
                    ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
                },
                select: { id: true, status: true, assigneeId: true, notes: true, dueDate: true, updatedAt: true },
            });

            await tx.auditLog.create({
                data: {
                    actorId: actor.id,
                    action: "COUNSELLOR_TASK_UPDATED",
                    entityType: "CounsellorTask",
                    entityId: taskId,
                    beforeState: toJson({ status: task.status, assigneeId: task.assigneeId }),
                    afterState: toJson({ status: updated.status, assigneeId: updated.assigneeId }),
                },
            });

            return updated;
        });
    }
}