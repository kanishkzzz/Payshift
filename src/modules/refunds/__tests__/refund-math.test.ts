import { describe, it, expect } from "vitest";
import { calculateRefund, DEFAULT_REFUND_RULES } from "../refund-math";

const base = {
    amountPaidPaise: BigInt(2_000_000),  // ₹20,000 paid
    registrationPaise: BigInt(200_000),  // ₹2,000 registration
    courseStart: "2026-07-01",
    courseEnd: "2027-03-31",             // 274 days inclusive
    enrolledOn: "2026-06-15",
};

describe("calculateRefund", () => {
    it("pro-rata: leaving on 2 Nov 2026 refunds ₹9,788.32", () => {
        const r = calculateRefund({ ...base, leaveDate: "2026-11-02" });
        expect(r.basis).toBe("PRO_RATA");
        expect(r.totalDays).toBe(274);
        expect(r.remainingDays).toBe(149);
        expect(r.refundableBasePaise).toBe(BigInt(1_800_000));
        expect(r.refundPaise).toBe(BigInt(978_832));
        expect(r.paidByDate).toBe("2026-11-12");
        expect(r.steps.at(-1)).toContain("₹9,788.32");
    });

    it("before course start: full amount minus registration", () => {
        const r = calculateRefund({ ...base, leaveDate: "2026-06-20" });
        expect(r.basis).toBe("BEFORE_START");
        expect(r.refundPaise).toBe(BigInt(1_800_000));
    });

    it("within cooling-off: full amount minus registration", () => {
        const r = calculateRefund({ ...base, enrolledOn: "2026-07-05", leaveDate: "2026-07-10" });
        expect(r.basis).toBe("COOLING_OFF");
        expect(r.refundPaise).toBe(BigInt(1_800_000));
    });

    it("day 7 after enrolment is outside cooling-off", () => {
        const r = calculateRefund({ ...base, enrolledOn: "2026-07-05", leaveDate: "2026-07-12" });
        expect(r.basis).toBe("PRO_RATA");
    });

    it("first day of course (no cooling-off): almost full pro-rata", () => {
        const r = calculateRefund({ ...base, leaveDate: "2026-07-01" });
        expect(r.remainingDays).toBe(273);
        expect(r.refundPaise).toBe((BigInt(1_800_000) * BigInt(273)) / BigInt(274));
    });

    it("last day and after course end: zero", () => {
        expect(calculateRefund({ ...base, leaveDate: "2027-03-31" }).refundPaise).toBe(BigInt(0));
        const after = calculateRefund({ ...base, leaveDate: "2027-04-15" });
        expect(after.basis).toBe("COURSE_ENDED");
        expect(after.refundPaise).toBe(BigInt(0));
    });

    it("paid less than registration: nothing refundable, never negative", () => {
        const r = calculateRefund({ ...base, amountPaidPaise: BigInt(100_000), leaveDate: "2026-11-02" });
        expect(r.basis).toBe("NOTHING_REFUNDABLE");
        expect(r.refundPaise).toBe(BigInt(0));
    });

    it("policy can make registration refundable", () => {
        const r = calculateRefund({
            ...base,
            leaveDate: "2026-11-02",
            rules: { ...DEFAULT_REFUND_RULES, registrationRefundable: true },
        });
        expect(r.refundableBasePaise).toBe(BigInt(2_000_000));
    });

    it("rejects invalid input", () => {
        expect(() => calculateRefund({ ...base, courseEnd: "2026-06-01", leaveDate: "2026-11-02" })).toThrow();
        expect(() => calculateRefund({ ...base, amountPaidPaise: BigInt(-1), leaveDate: "2026-11-02" })).toThrow();
    });
});