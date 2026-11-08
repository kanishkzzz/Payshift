import { z } from "zod";
import { RefundReasonCode, RefundStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calendarDaysDifferenceIST, toISTCalendarDateString } from "@/modules/ledger/date-utils";
import { calculateRefund, type RefundResult } from "./refund-math";
import {
    REFUND_REASON_LABELS,
    type CreateRefundCaseInput,
    type RefundCaseListItem,
    type RefundTransitionAction,
} from "./types";

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
    static async preview(enrollmentId: string, leaveDate?: string) {
        const resolvedLeaveDate = leaveDate ?? toISTCalendarDateString(new Date());
        const { policy, calculation } = await computeForEnrollment(enrollmentId, resolvedLeaveDate);
        return { policyVersion: policy.version, ...serialize(calculation) };
    }

    /** Creates a PENDING case, marks the student LEFT (stops reminders), and audits it. */
    static async createCase(input: CreateRefundCaseInput) {
        if (input.reasonCode === "OTHER" && (!input.reasonDetail || input.reasonDetail.trim().length === 0)) {
            throw new RefundError("reasonDetail is required when reasonCode is OTHER.", 400, "REASON_DETAIL_REQUIRED");
        }

        const open = await prisma.refundCase.findFirst({
            where: { enrollmentId: input.enrollmentId, status: { in: ["PENDING", "APPROVED"] } },
        });
        if (open) throw new RefundError("An open refund case already exists for this enrollment.", 409, "CASE_EXISTS");

        const resolvedLeaveDate = input.leaveDate ?? toISTCalendarDateString(new Date());
        const { enrollment, policy, calculation } = await computeForEnrollment(input.enrollmentId, resolvedLeaveDate);

        const created = await prisma.$transaction(async (tx) => {
            const refundCase = await tx.refundCase.create({
                data: {
                    enrollmentId: enrollment.id,
                    leaveDate: istMidnight(resolvedLeaveDate),
                    computedPaise: calculation.refundPaise,
                    policyVersion: policy.version,
                    paidByDate: istMidnight(calculation.paidByDate),
                    reasonCode: input.reasonCode,
                    reasonDetail: input.reasonDetail?.trim() || null,
                    status: "PENDING",
                },
            });

            await tx.student.update({
                where: { id: enrollment.studentId },
                data: { status: "LEFT", leftOn: istMidnight(resolvedLeaveDate) },
            });

            await tx.auditLog.create({
                data: {
                    actorId: input.actorId,
                    action: "REFUND_CASE_CREATED",
                    entityType: "REFUND_CASE",
                    entityId: refundCase.id,
                    afterState: {
                        studentId: enrollment.studentId,
                        policyVersion: policy.version,
                        reasonCode: input.reasonCode,
                        reasonDetail: input.reasonDetail?.trim() || null,
                        ...serialize(calculation),
                    },
                },
            });

            return refundCase;
        });

        return {
            id: created.id,
            status: created.status,
            policyVersion: policy.version,
            reasonCode: created.reasonCode,
            reasonDetail: created.reasonDetail,
            reasonLabel: REFUND_REASON_LABELS[created.reasonCode] ?? created.reasonCode,
            ...serialize(calculation),
        };
    }

    /**
     * Allowed transitions only:
     * - PENDING -> APPROVED | REJECTED
     * - APPROVED -> SETTLED (validated against total paid vs already settled in single transaction)
     * Any other transition returns 409.
     */
    static async transition(id: string, action: RefundTransitionAction, actorId: string) {
        return prisma.$transaction(async (tx) => {
            const existing = await tx.refundCase.findUnique({
                where: { id },
                include: {
                    enrollment: {
                        include: {
                            instalments: {
                                include: {
                                    allocations: {
                                        where: { payment: { status: "MATCHED" } },
                                        select: { amountPaise: true },
                                    },
                                },
                            },
                        },
                    },
                },
            });

            if (!existing) {
                throw new RefundError("Refund case not found.", 404, "NOT_FOUND");
            }

            if (action === "approve") {
                if (existing.status !== "PENDING") {
                    throw new RefundError(
                        `Cannot approve a refund case in ${existing.status} status. Only PENDING cases can be approved.`,
                        409,
                        "INVALID_TRANSITION"
                    );
                }

                await tx.refundCase.update({
                    where: { id },
                    data: {
                        status: "APPROVED",
                        approvedById: actorId,
                    },
                });

                await tx.auditLog.create({
                    data: {
                        actorId,
                        action: "REFUND_CASE_APPROVED",
                        entityType: "REFUND_CASE",
                        entityId: id,
                        beforeState: { status: existing.status },
                        afterState: { status: "APPROVED", approvedById: actorId },
                    },
                });

                return { id, status: "APPROVED" as RefundStatus };
            }

            if (action === "reject") {
                if (existing.status !== "PENDING") {
                    throw new RefundError(
                        `Cannot reject a refund case in ${existing.status} status. Only PENDING cases can be rejected.`,
                        409,
                        "INVALID_TRANSITION"
                    );
                }

                await tx.refundCase.update({
                    where: { id },
                    data: {
                        status: "REJECTED",
                        approvedById: actorId,
                    },
                });

                await tx.auditLog.create({
                    data: {
                        actorId,
                        action: "REFUND_CASE_REJECTED",
                        entityType: "REFUND_CASE",
                        entityId: id,
                        beforeState: { status: existing.status },
                        afterState: { status: "REJECTED", approvedById: actorId },
                    },
                });

                return { id, status: "REJECTED" as RefundStatus };
            }

            if (action === "settle") {
                if (existing.status !== "APPROVED") {
                    throw new RefundError(
                        `Cannot settle a refund case in ${existing.status} status. Only APPROVED cases can be settled.`,
                        409,
                        "INVALID_TRANSITION"
                    );
                }

                // 1. Compute paidPaise: sum of Allocation.amountPaise for all instalments of this enrollment with MATCHED payment
                const paidPaise = existing.enrollment.instalments
                    .flatMap((inst) => inst.allocations)
                    .reduce((sum, a) => sum + a.amountPaise, ZERO);

                // 2. Compute alreadySettledPaise: sum of computedPaise of other SETTLED refund cases on the same enrollment
                const otherSettled = await tx.refundCase.findMany({
                    where: {
                        enrollmentId: existing.enrollmentId,
                        status: "SETTLED",
                        id: { not: existing.id },
                    },
                    select: { computedPaise: true },
                });
                const alreadySettledPaise = otherSettled.reduce((sum, r) => sum + r.computedPaise, ZERO);

                // 3. Validation: If computedPaise > paidPaise - alreadySettledPaise -> 422
                const maxAvailableRefundPaise = paidPaise - alreadySettledPaise;
                if (existing.computedPaise > maxAvailableRefundPaise) {
                    throw new RefundError(
                        "Refund exceeds amount paid on this enrollment",
                        422,
                        "REFUND_EXCEEDS_PAID"
                    );
                }

                // 4. Update status to SETTLED with settledAt and settledById
                const settledAt = new Date();
                await tx.refundCase.update({
                    where: { id },
                    data: {
                        status: "SETTLED",
                        settledAt,
                        settledById: actorId,
                    },
                });

                // 5. Append audit log entry (never modify original Payment rows)
                await tx.auditLog.create({
                    data: {
                        actorId,
                        action: "REFUND_CASE_SETTLED",
                        entityType: "REFUND_CASE",
                        entityId: id,
                        beforeState: { status: existing.status },
                        afterState: {
                            status: "SETTLED",
                            settledAt,
                            settledById: actorId,
                            computedPaise: existing.computedPaise.toString(),
                            paidPaise: paidPaise.toString(),
                            alreadySettledPaise: alreadySettledPaise.toString(),
                        },
                    },
                });

                return { id, status: "SETTLED" as RefundStatus };
            }

            throw new RefundError(`Unsupported refund action: ${String(action)}`, 400, "BAD_ACTION");
        });
    }

    /** All cases with the 10-day SLA countdown and paid vs refund amounts for staff. */
    static async list(options: { status?: RefundStatus; today?: Date | string } = {}): Promise<RefundCaseListItem[]> {
        const todayStr = toISTCalendarDateString(options.today ?? new Date());
        const cases = await prisma.refundCase.findMany({
            where: options.status ? { status: options.status } : {},
            orderBy: { paidByDate: "asc" },
            include: {
                enrollment: {
                    select: {
                        student: { select: { id: true, name: true } },
                        instalments: {
                            include: {
                                allocations: {
                                    where: { payment: { status: "MATCHED" } },
                                    select: { amountPaise: true },
                                },
                            },
                        },
                    },
                },
            },
        });

        return cases.map((c) => {
            const isOpen = c.status === "PENDING" || c.status === "APPROVED";
            const daysLeft = calendarDaysDifferenceIST(todayStr, c.paidByDate);
            const paidPaise = c.enrollment.instalments
                .flatMap((i) => i.allocations)
                .reduce((sum, a) => sum + a.amountPaise, ZERO);

            return {
                id: c.id,
                student: c.enrollment.student,
                enrollmentId: c.enrollmentId,
                leaveDate: toISTCalendarDateString(c.leaveDate),
                computedPaise: c.computedPaise.toString(),
                paidPaise: paidPaise.toString(),
                policyVersion: c.policyVersion,
                reasonCode: c.reasonCode,
                reasonDetail: c.reasonDetail,
                reasonLabel: REFUND_REASON_LABELS[c.reasonCode] ?? c.reasonCode,
                status: c.status,
                paidByDate: toISTCalendarDateString(c.paidByDate),
                daysLeft: isOpen ? daysLeft : null,
                slaStatus: !isOpen ? "CLOSED" : daysLeft < 0 ? "BREACHED" : daysLeft <= 3 ? "AT_RISK" : "ON_TRACK",
            };
        });
    }
}
