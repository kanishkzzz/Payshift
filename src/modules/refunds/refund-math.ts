import { calendarDaysDifferenceIST, parseISTDateParts, toISTCalendarDateString } from "@/modules/ledger/date-utils";

export interface RefundRules {
    coolingOffDays: number;          // leave within N days of enrolling -> full refundable base
    registrationRefundable: boolean; // default false (registration is non-refundable)
    settlementDays: number;          // refund must be paid within N days of leaving
}

export const DEFAULT_REFUND_RULES: RefundRules = {
    coolingOffDays: 7,
    registrationRefundable: false,
    settlementDays: 10,
};

export type RefundBasis = "BEFORE_START" | "COOLING_OFF" | "PRO_RATA" | "COURSE_ENDED" | "NOTHING_REFUNDABLE";

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
    steps: string[];    // human-readable breakdown for staff and parents
}

const ZERO = BigInt(0);

const rupee = (paise: bigint) =>
    `₹${(Number(paise) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function addDays(date: string, days: number): string {
    const { year, month, day } = parseISTDateParts(date);
    const d = new Date(Date.UTC(year, month - 1, day + days));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Pro-rata refund, policy-driven. Pure: no DB, integer paise only.
 *   Refund = max(0, (Paid − Registration) × RemainingDays ÷ TotalDays)
 * Days are IST calendar days. The leave day counts as a used day.
 */
export function calculateRefund(input: RefundInput): RefundResult {
    const rules = input.rules ?? DEFAULT_REFUND_RULES;
    const paid = input.amountPaidPaise;
    const registration = input.registrationPaise;

    if (paid < ZERO || registration < ZERO) throw new Error("Amounts cannot be negative");

    const start = toISTCalendarDateString(input.courseStart);
    const end = toISTCalendarDateString(input.courseEnd);
    const leave = toISTCalendarDateString(input.leaveDate);

    const totalDays = calendarDaysDifferenceIST(start, end) + 1; // inclusive
    if (totalDays <= 0) throw new Error("courseEnd must be on or after courseStart");

    const nonRefundable = rules.registrationRefundable ? ZERO : registration < paid ? registration : paid;
    const base = paid - nonRefundable;
    const remainingDays = Math.min(Math.max(calendarDaysDifferenceIST(leave, end), 0), totalDays);
    const paidByDate = addDays(leave, rules.settlementDays);

    const steps = [
        `Amount paid: ${rupee(paid)}`,
        rules.registrationRefundable
            ? "Registration fee is refundable under this policy"
            : `Less non-refundable registration fee: ${rupee(nonRefundable)}`,
        `Refundable base: ${rupee(base)}`,
    ];

    const result = (refundPaise: bigint, basis: RefundBasis, days: number): RefundResult => ({
        refundPaise,
        basis,
        refundableBasePaise: base,
        totalDays,
        remainingDays: days,
        paidByDate,
        steps,
    });

    if (base <= ZERO) {
        steps.push("Nothing refundable after the registration fee");
        return result(ZERO, "NOTHING_REFUNDABLE", remainingDays);
    }

    if (calendarDaysDifferenceIST(start, leave) < 0) {
        steps.push(`Left before course start (${start}): full refundable base`);
        return result(base, "BEFORE_START", totalDays);
    }

    if (input.enrolledOn) {
        const daysSinceEnrolment = calendarDaysDifferenceIST(input.enrolledOn, leave);
        if (daysSinceEnrolment >= 0 && daysSinceEnrolment < rules.coolingOffDays) {
            steps.push(`Left within the ${rules.coolingOffDays}-day cooling-off period: full refundable base`);
            return result(base, "COOLING_OFF", remainingDays);
        }
    }

    if (remainingDays === 0) {
        steps.push(`No course days remaining after ${leave}`);
        return result(ZERO, "COURSE_ENDED", 0);
    }

    const refund = (base * BigInt(remainingDays)) / BigInt(totalDays); // floor to paise
    steps.push(`Remaining course days: ${remainingDays} of ${totalDays}`);
    steps.push(`Refund = ${rupee(base)} × ${remainingDays} ÷ ${totalDays} = ${rupee(refund)}`);
    return result(refund, "PRO_RATA", remainingDays);
}