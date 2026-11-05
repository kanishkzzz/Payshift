import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { calendarDaysDifferenceIST, toISTCalendarDateString } from "@/modules/ledger/date-utils";
import { calculateRefund, type RefundResult } from "./refund-math";

export class RefundError extends Error {
    constructor(message: string, public statusCode = 400, public code?: string) {
        super(message);
        this.name = "RefundError";
    }
}

const ZERO = BigInt(0);
const rulesSchema = z.object({
    coolingOffDays: z.number().int().min(0),
    registrationRefundable: z.boolean(),
    settlementDays: z.number().int().min(0),
});
const istMidnight = (date: string) => new Date(`${date}T00:00:00+05:30`);

const serialize = (calc: RefundResult) => ({
    ...calc,
    refundPaise: calc.refundPaise.toString(),
    refundableBasePaise: calc.refundableBasePaise.toString(),
});

/** Loads enrollment + policy active on the leave date, and computes the refund. */
async function computeForEnrollment(enrollmentId: string, leaveDate: string) {
    const enrollment = await prisma.enrollment.findUnique({
        where: { id: enrollmentId },
        include: {
            plan: true,
            student: { include: { batch: true } },
            instalments: {
                include: {
                    allocations: { where: { payment: { status: "MATCHED" } }, select: { amountPaise: true } },
                },
            },
        },
    });
    if (!enrollment) throw new RefundError("Enrollment not found.", 404, "NOT_FOUND");

    const policy = await prisma.refundPolicy.findFirst({
        where: { effectiveFrom: { lte: istMidnight(leaveDate) } },
        orderBy: { effectiveFrom: "desc" },
    });
    if (!policy) throw new RefundError(`No refund policy is effective on ${leaveDate}.`, 422, "NO_POLICY");

    const rules = rulesSchema.safeParse(policy.rulesJson);
    if (!rules.success) {
        throw new RefundError(`Refund policy ${policy.version} has invalid rules.`, 500, "INVALID_POLICY");
    }

    const amountPaidPaise = enrollment.instalments
        .flatMap((i) => i.allocations)
        .reduce((sum, a) => sum + a.amountPaise, ZERO);

    const calculation = calculateRefund({
        amountPaidPaise,
        registrationPaise: enrollment.plan.registrationPaise,
        courseStart: enrollment.student.batch.courseStart,
        courseEnd: enrollment.student.batch.courseEnd,
        enrolledOn: enrollment.enrolledAt,
        leaveDate,
        rules: rules.data,
    });

    return { enrollment, policy, calculation };
}

export class RefundService {
    /** Step-by-step calculation without saving anything. */
    static async preview(enrollmentId: string, leaveDate: string) {
        const { policy, calculation } = await computeForEnrollment(enrollmentId, leaveDate);
        return { policyVersion: policy.version, ...serialize(calculation) };
    }

    /** Creates a PENDING case, marks the student LEFT (stops reminders), and audits it. */
    static async createCase(input: {
        enrollmentId: string;
        leaveDate: string;
        reason?: string;
        actorId: string;
    }) {
        const open = await prisma.refundCase.findFirst({
            where: { enrollmentId: input.enrollmentId, status: { in: ["PENDING", "APPROVED"] } },
        });
        if (open) throw new RefundError("An open refund case already exists for this enrollment.", 409, "CASE_EXISTS");

        const { enrollment, policy, calculation } = await computeForEnrollment(input.enrollmentId, input.leaveDate);

        const created = await prisma.$transaction(async (tx) => {
            const refundCase = await tx.refundCase.create({
                data: {
                    enrollmentId: enrollment.id,
                    leaveDate: istMidnight(input.leaveDate),
                    computedPaise: calculation.refundPaise,
                    policyVersion: policy.version,
                    paidByDate: istMidnight(calculation.paidByDate),
                    reason: input.reason,
                },
            });

            await tx.student.update({
                where: { id: enrollment.studentId },
                data: { status: "LEFT", leftOn: istMidnight(input.leaveDate) },
            });

            await tx.auditLog.create({
                data: {
                    actorId: input.actorId,
                    action: "REFUND_CASE_CREATED",
                    entityType: "REFUND_CASE",
                    entityId: refundCase.id,
                    afterState: { studentId: enrollment.studentId, policyVersion: policy.version, ...serialize(calculation) },
                },
            });

            return refundCase;
        });

        return { id: created.id, status: created.status, policyVersion: policy.version, ...serialize(calculation) };
    }

    /** PENDING -> APPROVED | REJECTED, APPROVED -> SETTLED. Guarded so double-clicks can't skip states. */
    static async transition(id: string, action: "approve" | "reject" | "settle", actorId: string) {
        const transitions = {
            approve: { from: "PENDING", to: "APPROVED", data: { approvedById: actorId } },
            reject: { from: "PENDING", to: "REJECTED", data: { approvedById: actorId } }, // reviewer recorded
            settle: { from: "APPROVED", to: "SETTLED", data: { settledById: actorId, settledAt: new Date() } },
        } as const;
        const t = transitions[action];

        const res = await prisma.refundCase.updateMany({
            where: { id, status: t.from },
            data: { status: t.to, ...t.data },
        });

        if (res.count === 0) {
            const existing = await prisma.refundCase.findUnique({ where: { id }, select: { status: true } });
            if (!existing) throw new RefundError("Refund case not found.", 404, "NOT_FOUND");
            throw new RefundError(`Cannot ${action} a refund case in ${existing.status} status.`, 409, "INVALID_TRANSITION");
        }

        await prisma.auditLog.create({
            data: {
                actorId,
                action: `REFUND_CASE_${t.to}`,
                entityType: "REFUND_CASE",
                entityId: id,
                beforeState: { status: t.from },
                afterState: { status: t.to },
            },
        });

        return { id, status: t.to };
    }

    /** All cases with the 10-day SLA countdown for the staff dashboard. */
    static async list(today: Date | string = new Date()) {
        const todayStr = toISTCalendarDateString(today);
        const cases = await prisma.refundCase.findMany({
            orderBy: { paidByDate: "asc" },
            include: { enrollment: { select: { student: { select: { id: true, name: true } } } } },
        });

        return cases.map((c) => {
            const isOpen = c.status === "PENDING" || c.status === "APPROVED";
            const daysLeft = calendarDaysDifferenceIST(todayStr, c.paidByDate);
            return {
                id: c.id,
                student: c.enrollment.student,
                leaveDate: toISTCalendarDateString(c.leaveDate),
                computedPaise: c.computedPaise.toString(),
                policyVersion: c.policyVersion,
                status: c.status,
                paidByDate: toISTCalendarDateString(c.paidByDate),
                daysLeft: isOpen ? daysLeft : null,
                slaStatus: !isOpen ? "CLOSED" : daysLeft < 0 ? "BREACHED" : daysLeft <= 3 ? "AT_RISK" : "ON_TRACK",
            };
        });
    }
}