import { describe, it, expect } from "vitest";
import {
    RISK_CONFIG,
    buildFeatures,
    buildLlmPayload,
    decideFlagAction,
    renderExplanation,
    scoreRisk,
    validateLlmExplanation,
} from "../risk-math";
import type { RiskAttendanceRow, RiskInstalmentRow, RiskRawInput, RiskTestRow } from "../types";

const ASOF = "2026-11-02";

const utc = (d: string) => new Date(`${d}T00:00:00.000Z`);
const addDays = (d: string, n: number) => {
    const [y, m, day] = d.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, day + n)).toISOString().slice(0, 10);
};
const inst = (dueDate: string, amount: number, paid = 0, graceDays = 3): RiskInstalmentRow => ({
    id: `inst_${dueDate}`,
    dueDate: utc(dueDate),
    amountPaise: BigInt(amount),
    paidPaise: BigInt(paid),
    graceDays,
});
const attendanceRun = (start: string, pattern: boolean[]): RiskAttendanceRow[] =>
    pattern.map((present, i) => ({ date: utc(addDays(start, i)), present }));
const test = (date: string, score: number, maxScore = 100): RiskTestRow => ({ date: utc(date), score, maxScore });

const run = (raw: RiskRawInput, asOf = ASOF) => {
    const features = buildFeatures(raw, asOf);
    return { features, result: scoreRisk(features) };
};

describe("RISK_CONFIG", () => {
    it("weights are integers summing to 100", () => {
        const { fee, attendance, academic } = RISK_CONFIG.weights;
        expect(fee + attendance + academic).toBe(100);
        expect([fee, attendance, academic].every(Number.isInteger)).toBe(true);
    });
});

describe("buildFeatures", () => {
    it("rejects a non-ISO asOf date", () => {
        expect(() => buildFeatures({ instalments: [], attendance: [], tests: [] }, "02/11/2026")).toThrow();
    });

    it("respects the grace period via ledger daysOverdue", () => {
        const { features } = run({ instalments: [inst("2026-10-31", 1_500_000)], attendance: [], tests: [] });
        expect(features.fee.maxDaysOverdue).toBe(0);
        expect(features.fee.overdueInstalments).toBe(0);
    });

    it("ignores fully paid instalments", () => {
        const { features } = run({
            instalments: [inst("2026-08-01", 1_500_000, 1_500_000)],
            attendance: [],
            tests: [],
        });
        expect(features.fee.overdueInstalments).toBe(0);
    });

    it("only counts attendance inside the lookback window and never in the future", () => {
        const { features } = run({
            instalments: [],
            attendance: [
                { date: utc("2026-09-01"), present: false }, // 62 days back: excluded
                { date: utc("2026-11-05"), present: false }, // future: excluded
                ...attendanceRun("2026-10-20", [true, true, true, true, true, true]),
            ],
            tests: [],
        });
        expect(features.attendance.records).toBe(6);
        expect(features.attendance.attendancePct).toBe(100);
    });

    it("ignores future tests and tests with maxScore 0", () => {
        const { features } = run({
            instalments: [],
            attendance: [],
            tests: [test("2026-09-20", 80), test("2026-10-18", 70), test("2026-11-10", 10), test("2026-10-01", 5, 0)],
        });
        expect(features.academic.tests).toBe(2);
        expect(features.academic.latestPct).toBe(70);
        expect(features.academic.dropPct).toBe(10);
    });

    it("marks thin data as insufficient instead of imputing zero", () => {
        const { features } = run({
            instalments: [],
            attendance: attendanceRun("2026-10-20", [false, false, false]),
            tests: [test("2026-10-18", 20)],
        });
        expect(features.attendance.dataSufficient).toBe(false);
        expect(features.academic.dataSufficient).toBe(false);
        expect(features.fee.dataSufficient).toBe(false);
    });
});

describe("scoreRisk", () => {
    it("fee band boundary: 30 days → 60, 31 days → 85", () => {
        const thirty = run({ instalments: [inst("2026-10-03", 1_000_000)], attendance: [], tests: [] });
        const thirtyOne = run({ instalments: [inst("2026-10-02", 1_000_000)], attendance: [], tests: [] });
        expect(thirty.features.fee.maxDaysOverdue).toBe(30);
        expect(thirty.result.subScores.fee).toBe(60);
        expect(thirtyOne.features.fee.maxDaysOverdue).toBe(31);
        expect(thirtyOne.result.subScores.fee).toBe(85);
    });

    it("STU-0587 profile: fee 23 days + score drop → 63 MEDIUM, attendance insufficient", () => {
        const { features, result } = run({
            instalments: [inst("2026-08-10", 1_500_000, 1_500_000), inst("2026-10-10", 1_500_000)],
            attendance: attendanceRun("2026-10-01", [true, true, false, false]),
            tests: [test("2026-09-15", 85), test("2026-10-15", 62)],
        });
        expect(features.fee.maxDaysOverdue).toBe(23);
        expect(result.subScores).toEqual({ fee: 60, attendance: null, academic: 70 });
        expect(result.score).toBe(63);
        expect(result.tier).toBe("MEDIUM");
        expect(result.missingSignals).toEqual(["attendance"]);
        expect(result.reasons.map((r) => r.code)).toEqual(["FEE_OVERDUE", "SCORE_DROP"]);
    });

    it("financial stress alone can never be HIGH (corroboration rule)", () => {
        const { result } = run({
            instalments: [inst("2026-08-01", 1_500_000), inst("2026-08-10", 1_500_000)],
            attendance: [],
            tests: [],
        });
        expect(result.score).toBe(100);
        expect(result.tier).toBe("MEDIUM");
        expect(result.corroborationCapped).toBe(true);
        expect(result.firingSignals).toBe(1);
    });

    it("fee overdue + attendance collapse → HIGH with two firing signals", () => {
        const { result } = run({
            instalments: [inst("2026-08-01", 1_500_000)],
            attendance: attendanceRun("2026-10-20", [true, true, true, true, false, false, false, false]),
            tests: [test("2026-09-20", 80), test("2026-10-18", 82)],
        });
        expect(result.subScores).toEqual({ fee: 100, attendance: 100, academic: 0 });
        expect(result.score).toBe(80);
        expect(result.tier).toBe("HIGH");
        expect(result.firingSignals).toBe(2);
        expect(result.corroborationCapped).toBe(false);
        expect(result.reasons.map((r) => r.code)).toEqual([
            "FEE_OVERDUE",
            "ATTENDANCE_LOW",
            "ATTENDANCE_DROP",
            "ATTENDANCE_STREAK",
        ]);
    });

    it("new joiner with no history is LOW", () => {
        const { result } = run({
            instalments: [inst("2026-12-01", 1_500_000)],
            attendance: attendanceRun("2026-10-30", [true, true, true]),
            tests: [],
        });
        expect(result.score).toBe(0);
        expect(result.tier).toBe("LOW");
        expect(result.missingSignals).toEqual(["attendance", "academic"]);
    });

    it("is deterministic", () => {
        const raw: RiskRawInput = {
            instalments: [inst("2026-09-10", 1_000_000)],
            attendance: attendanceRun("2026-10-10", [true, false, true, false, false, true, false]),
            tests: [test("2026-09-01", 70), test("2026-10-01", 55), test("2026-10-25", 40)],
        };
        expect(run(raw)).toEqual(run(raw));
    });
});

describe("decideFlagAction", () => {
    const result = (score: number, tier: "LOW" | "MEDIUM" | "HIGH") =>
        ({ ...scoreRisk(buildFeatures({ instalments: [], attendance: [], tests: [] }, ASOF)), score, tier });

    it("LOW with no open flag → NONE", () => {
        expect(decideFlagAction(result(10, "LOW"), null, null, ASOF)).toEqual({ action: "NONE", reason: "BELOW_THRESHOLD" });
    });

    it("MEDIUM open flag, now HIGH → ESCALATE", () => {
        expect(decideFlagAction(result(80, "HIGH"), { tier: "MEDIUM", score: 50 }, null, ASOF).action).toBe("ESCALATE");
    });

    it("HIGH open flag, now MEDIUM → NONE (never auto-downgrades)", () => {
        expect(decideFlagAction(result(50, "MEDIUM"), { tier: "HIGH", score: 80 }, null, ASOF)).toEqual({
            action: "NONE",
            reason: "OPEN_FLAG_EXISTS",
        });
    });

    it("recent FALSE_FLAG and not materially worse → COOLDOWN", () => {
        const d = decideFlagAction(result(65, "MEDIUM"), null, { score: 60, reviewedAt: utc("2026-10-28") }, ASOF);
        expect(d).toEqual({ action: "NONE", reason: "COOLDOWN" });
    });

    it("recent FALSE_FLAG but score jumped by ≥ 15 → CREATE", () => {
        const d = decideFlagAction(result(80, "HIGH"), null, { score: 60, reviewedAt: utc("2026-10-28") }, ASOF);
        expect(d.action).toBe("CREATE");
    });

    it("FALSE_FLAG older than cooldown → CREATE", () => {
        const d = decideFlagAction(result(65, "MEDIUM"), null, { score: 60, reviewedAt: utc("2026-10-10") }, ASOF);
        expect(d.action).toBe("CREATE");
    });
});

describe("explanations", () => {
    const stu0587 = run({
        instalments: [inst("2026-08-10", 1_500_000, 1_500_000), inst("2026-10-10", 1_500_000)],
        attendance: attendanceRun("2026-10-01", [true, true, false, false]),
        tests: [test("2026-09-15", 85), test("2026-10-15", 62)],
    }).result;

    it("template is observational and at most 2 sentences", () => {
        const text = renderExplanation(stu0587.reasons);
        expect(text).toBe(
            "1 fee instalment is overdue by 23 days. Latest test score is 62%, down from an earlier average of 85%."
        );
        expect(validateLlmExplanation(text, stu0587.reasons).ok).toBe(true);
    });

    it("validator rejects predictions and judgements", () => {
        const check = validateLlmExplanation("The student will drop out soon and seems lazy.", stu0587.reasons);
        expect(check.ok).toBe(false);
        expect(check.problems.some((p) => p.startsWith("BANNED_PHRASE"))).toBe(true);
    });

    it("validator rejects invented numbers", () => {
        const check = validateLlmExplanation("Fees are 45 days late.", stu0587.reasons);
        expect(check.problems).toContain("UNKNOWN_NUMBER:45");
    });

    it("validator rejects more than 2 sentences", () => {
        const check = validateLlmExplanation("Fees are late. Scores fell. Attendance is fine.", stu0587.reasons);
        expect(check.problems).toContain("TOO_MANY_SENTENCES");
    });

    it("LLM payload carries only reason codes and numbers", () => {
        const payload = buildLlmPayload(stu0587.reasons);
        expect(Object.keys(payload).sort()).toEqual(["instructions", "promptVersion", "reasons"]);
        for (const r of payload.reasons) {
            expect(Object.keys(r).sort()).toEqual(["code", "observed"]);
            expect(Object.values(r.observed).every((v) => typeof v === "number")).toBe(true);
        }
    });
});