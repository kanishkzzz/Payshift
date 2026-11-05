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