import type { RefundReasonCode, RefundStatus } from "@prisma/client";

export interface RefundRules {
    coolingOffDays: number;          // leave within N days of enrolling -> full refundable base
    registrationRefundable: boolean; // default false
    settlementDays: number;          // refund due within N days of leaving
}

export const DEFAULT_REFUND_RULES: RefundRules = {
    coolingOffDays: 7,
    registrationRefundable: false,
    settlementDays: 10,
};

export type RefundBasis =
    | "BEFORE_START"
    | "COOLING_OFF"
    | "PRO_RATA"
    | "COURSE_ENDED"
    | "NOTHING_REFUNDABLE";

export interface RefundInput {
    amountPaidPaise: bigint;
    registrationPaise: bigint;
    courseStart: Date | string;
    courseEnd: Date | string;
    enrolledOn?: Date | string;
    leaveDate: Date | string;
    rules?: RefundRules;
}

export interface RefundResult {
    refundPaise: bigint;
    basis: RefundBasis;
    refundableBasePaise: bigint;
    totalDays: number;
    remainingDays: number;
    paidByDate: string; // YYYY-MM-DD (IST)
    steps: string[];
}

export type RefundTransitionAction = "approve" | "reject" | "settle";
export type RefundSlaStatus = "ON_TRACK" | "AT_RISK" | "BREACHED" | "CLOSED";

export const REFUND_REASON_LABELS: Record<RefundReasonCode, string> = {
    STUDENT_WITHDRAWAL: "Student withdrawal",
    BATCH_CANCELLED: "Batch cancelled",
    MEDICAL_GROUNDS: "Medical grounds",
    DOUBLE_PAYMENT: "Double payment",
    OTHER: "Other",
};

export interface CreateRefundCaseInput {
    enrollmentId: string;
    leaveDate?: string;
    reasonCode: RefundReasonCode;
    reasonDetail?: string | null;
    actorId: string;
}

export interface RefundCaseListItem {
    id: string;
    student: { id: string; name: string };
    enrollmentId: string;
    leaveDate: string;
    computedPaise: string;
    policyVersion: string;
    reasonCode: RefundReasonCode;
    reasonDetail: string | null;
    reasonLabel: string;
    status: RefundStatus;
    paidByDate: string;
    paidPaise: string;
    daysLeft: number | null;
    slaStatus: RefundSlaStatus;
}
