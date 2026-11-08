/**
 * Pure Dropout-Risk Math.
 *
 * Invariants:
 * 1. Zero database or network calls. Plain objects in, plain objects out.
 * 2. Deterministic: same input + config → same score, tier, reasons and explanation.
 * 3. Observations, not predictions: reasons describe what happened, never what will happen.
 * 4. All dates compared as IST calendar days.
 * 5. Financial stress alone can never produce a HIGH tier (corroboration rule).
 * 6. Missing data is never imputed as bad data; the signal is excluded instead.
 */

import { daysOverdue } from "@/modules/ledger/ledger-math";
import { calendarDaysDifferenceIST, toISTCalendarDateString } from "@/modules/ledger/date-utils";
import type {
    AcademicFeatures,
    AttendanceFeatures,
    BelowBand,
    ExplanationCheck,
    FalseFlagSnapshot,
    FeatureVector,
    FeeFeatures,
    FlagDecision,
    LlmPayload,
    MinBand,
    OpenFlagSnapshot,
    ReasonCode,
    RiskAttendanceRow,
    RiskConfig,
    RiskInstalmentRow,
    RiskRawInput,
    RiskReason,
    RiskResult,
    RiskTestRow,
    Signal,
    SubScores,
    Tier,
} from "./types";

export const RISK_CONFIG: RiskConfig = {
    version: "risk-v2026.1",
    weights: { fee: 45, attendance: 35, academic: 20 },
    tiers: { medium: 40, high: 70 },
    firingThreshold: 50,
    minSignalsForHigh: 2,
    fee: {
        bands: [
            { min: 61, score: 100 },
            { min: 31, score: 85 },
            { min: 16, score: 60 },
            { min: 1, score: 30 },
        ],
        multipleOverdueBonus: 15,
    },
    attendance: {
        lookbackDays: 45,
        minRecords: 6,
        minRecordsForTrend: 6,
        absenceBands: [
            { min: 30, score: 100 },
            { min: 20, score: 70 },
            { min: 10, score: 40 },
        ],
        dropBands: [
            { min: 35, score: 90 },
            { min: 20, score: 70 },
        ],
        streakBands: [
            { min: 5, score: 85 },
            { min: 3, score: 60 },
        ],
    },
    academic: {
        maxTests: 5,
        minTests: 2,
        dropBands: [
            { min: 30, score: 90 },
            { min: 20, score: 70 },
            { min: 10, score: 40 },
        ],
        lowBands: [
            { below: 35, score: 70 },
            { below: 50, score: 40 },
        ],
    },
    cooldownDays: 14,
    cooldownScoreDelta: 15,
    taskDueDays: 3,
};

const SIGNALS: readonly Signal[] = ["fee", "attendance", "academic"];
const TIER_RANK: Record<Tier, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function tierRank(tier: Tier): number {
    return TIER_RANK[tier];
}

function pct(numerator: number, denominator: number): number {
    return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
}

function scoreFromMinBands(value: number, bands: readonly MinBand[]): number {
    const sorted = [...bands].sort((a, b) => b.min - a.min);
    for (const band of sorted) {
        if (value >= band.min) return band.score;
    }
    return 0;
}

function scoreFromBelowBands(value: number, bands: readonly BelowBand[]): number {
    const sorted = [...bands].sort((a, b) => a.below - b.below);
    for (const band of sorted) {
        if (value < band.below) return band.score;
    }
    return 0;
}

// =====================================================================
// Features
// =====================================================================

export function buildFeatures(
    raw: RiskRawInput,
    asOf: string,
    cfg: RiskConfig = RISK_CONFIG
): FeatureVector {
    if (!ISO_DATE.test(asOf)) {
        throw new Error(`asOf must be an IST calendar date (YYYY-MM-DD), received: ${asOf}`);
    }
    return {
        asOf,
        fee: buildFeeFeatures(raw.instalments, asOf),
        attendance: buildAttendanceFeatures(raw.attendance, asOf, cfg),
        academic: buildAcademicFeatures(raw.tests, asOf, cfg),
    };
}

function buildFeeFeatures(rows: RiskInstalmentRow[], asOf: string): FeeFeatures {
    let maxDaysOverdue = 0;
    let overdueInstalments = 0;

    for (const row of rows) {
        const days = daysOverdue(
            {
                dueDate: row.dueDate,
                amountPaise: row.amountPaise,
                paidPaise: row.paidPaise,
                graceDays: row.graceDays,
            },
            asOf
        );
        if (days > 0) {
            overdueInstalments += 1;
            if (days > maxDaysOverdue) maxDaysOverdue = days;
        }
    }

    return {
        dataSufficient: rows.length > 0,
        instalments: rows.length,
        overdueInstalments,
        maxDaysOverdue,
    };
}

function buildAttendanceFeatures(
    rows: RiskAttendanceRow[],
    asOf: string,
    cfg: RiskConfig
): AttendanceFeatures {
    const { lookbackDays, minRecords, minRecordsForTrend } = cfg.attendance;

    const days = rows
        .map((r) => ({ day: toISTCalendarDateString(r.date), present: r.present }))
        .filter((r) => {
            const diff = calendarDaysDifferenceIST(r.day, asOf);
            return diff >= 0 && diff < lookbackDays;
        })
        .sort((a, b) => a.day.localeCompare(b.day));

    const records = days.length;
    const presentCount = (list: typeof days) => list.filter((d) => d.present).length;

    const attendancePct = records > 0 ? pct(presentCount(days), records) : null;

    let earlierPct: number | null = null;
    let recentPct: number | null = null;
    let dropPct: number | null = null;
    if (records >= minRecordsForTrend) {
        const mid = Math.floor(records / 2);
        const earlier = days.slice(0, mid);
        const recent = days.slice(mid);
        earlierPct = pct(presentCount(earlier), earlier.length);
        recentPct = pct(presentCount(recent), recent.length);
        dropPct = earlierPct - recentPct;
    }

    let trailingAbsenceStreak = 0;
    for (let i = records - 1; i >= 0 && !days[i].present; i--) {
        trailingAbsenceStreak += 1;
    }

    return {
        dataSufficient: records >= minRecords,
        records,
        attendancePct,
        absencePct: attendancePct === null ? null : 100 - attendancePct,
        earlierPct,
        recentPct,
        dropPct,
        trailingAbsenceStreak,
    };
}

function buildAcademicFeatures(
    rows: RiskTestRow[],
    asOf: string,
    cfg: RiskConfig
): AcademicFeatures {
    const tests = rows
        .filter((r) => r.maxScore > 0)
        .map((r) => ({ day: toISTCalendarDateString(r.date), pct: pct(r.score, r.maxScore) }))
        .filter((t) => calendarDaysDifferenceIST(t.day, asOf) >= 0)
        .sort((a, b) => a.day.localeCompare(b.day))
        .slice(-cfg.academic.maxTests);

    const n = tests.length;
    if (n === 0) {
        return { dataSufficient: false, tests: 0, latestPct: null, previousAvgPct: null, dropPct: null };
    }

    const latestPct = tests[n - 1].pct;
    const previous = tests.slice(0, -1);
    const previousAvgPct =
        previous.length > 0
            ? Math.round(previous.reduce((sum, t) => sum + t.pct, 0) / previous.length)
            : null;

    return {
        dataSufficient: n >= cfg.academic.minTests,
        tests: n,
        latestPct,
        previousAvgPct,
        dropPct: previousAvgPct === null ? null : previousAvgPct - latestPct,
    };
}

// =====================================================================
// Scoring
// =====================================================================

interface Component {
    code: ReasonCode;
    score: number;
    observed: Record<string, number>;
}

interface SignalEvaluation {
    score: number;
    components: Component[];
}

function evaluateFee(f: FeeFeatures, cfg: RiskConfig): SignalEvaluation | null {
    if (!f.dataSufficient) return null;
    if (f.maxDaysOverdue === 0) return { score: 0, components: [] };

    let score = scoreFromMinBands(f.maxDaysOverdue, cfg.fee.bands);
    if (f.overdueInstalments >= 2) score += cfg.fee.multipleOverdueBonus;
    score = Math.min(100, score);

    return {
        score,
        components: [
            {
                code: "FEE_OVERDUE",
                score,
                observed: { overdueInstalments: f.overdueInstalments, maxDaysOverdue: f.maxDaysOverdue },
            },
        ],
    };
}

function evaluateAttendance(a: AttendanceFeatures, cfg: RiskConfig): SignalEvaluation | null {
    if (!a.dataSufficient || a.attendancePct === null || a.absencePct === null) return null;

    const components: Component[] = [];

    const lowScore = scoreFromMinBands(a.absencePct, cfg.attendance.absenceBands);
    if (lowScore > 0) {
        components.push({
            code: "ATTENDANCE_LOW",
            score: lowScore,
            observed: { attendancePct: a.attendancePct, records: a.records },
        });
    }

    if (a.dropPct !== null && a.earlierPct !== null && a.recentPct !== null) {
        const dropScore = scoreFromMinBands(a.dropPct, cfg.attendance.dropBands);
        if (dropScore > 0) {
            components.push({
                code: "ATTENDANCE_DROP",
                score: dropScore,
                observed: { fromPct: a.earlierPct, toPct: a.recentPct },
            });
        }
    }

    const streakScore = scoreFromMinBands(a.trailingAbsenceStreak, cfg.attendance.streakBands);
    if (streakScore > 0) {
        components.push({
            code: "ATTENDANCE_STREAK",
            score: streakScore,
            observed: { classes: a.trailingAbsenceStreak },
        });
    }

    return { score: Math.max(0, ...components.map((c) => c.score)), components };
}

function evaluateAcademic(f: AcademicFeatures, cfg: RiskConfig): SignalEvaluation | null {
    if (!f.dataSufficient || f.latestPct === null) return null;

    const components: Component[] = [];

    if (f.dropPct !== null && f.previousAvgPct !== null) {
        const dropScore = scoreFromMinBands(f.dropPct, cfg.academic.dropBands);
        if (dropScore > 0) {
            components.push({
                code: "SCORE_DROP",
                score: dropScore,
                observed: { latestPct: f.latestPct, previousAvgPct: f.previousAvgPct },
            });
        }
    }

    const lowScore = scoreFromBelowBands(f.latestPct, cfg.academic.lowBands);
    if (lowScore > 0) {
        components.push({ code: "SCORE_LOW", score: lowScore, observed: { latestPct: f.latestPct } });
    }

    return { score: Math.max(0, ...components.map((c) => c.score)), components };
}

export function scoreRisk(features: FeatureVector, cfg: RiskConfig = RISK_CONFIG): RiskResult {
    const evaluations: Record<Signal, SignalEvaluation | null> = {
        fee: evaluateFee(features.fee, cfg),
        attendance: evaluateAttendance(features.attendance, cfg),
        academic: evaluateAcademic(features.academic, cfg),
    };

    const subScores: SubScores = {
        fee: evaluations.fee?.score ?? null,
        attendance: evaluations.attendance?.score ?? null,
        academic: evaluations.academic?.score ?? null,
    };

    let weighted = 0;
    let coverage = 0;
    let firingSignals = 0;
    const missingSignals: Signal[] = [];

    for (const signal of SIGNALS) {
        const value = subScores[signal];
        if (value === null) {
            missingSignals.push(signal);
            continue;
        }
        weighted += value * cfg.weights[signal];
        coverage += cfg.weights[signal];
        if (value >= cfg.firingThreshold) firingSignals += 1;
    }

    const score = coverage > 0 ? Math.min(100, Math.max(0, Math.round(weighted / coverage))) : 0;

    let tier: Tier = score >= cfg.tiers.high ? "HIGH" : score >= cfg.tiers.medium ? "MEDIUM" : "LOW";
    let corroborationCapped = false;
    if (tier === "HIGH" && firingSignals < cfg.minSignalsForHigh) {
        tier = "MEDIUM";
        corroborationCapped = true;
    }

    const reasons: RiskReason[] = [];
    for (const signal of SIGNALS) {
        for (const c of evaluations[signal]?.components ?? []) {
            reasons.push({
                code: c.code,
                signal,
                componentScore: c.score,
                contribution: c.score * cfg.weights[signal],
                observed: c.observed,
            });
        }
    }
    reasons.sort(
        (a, b) =>
            b.contribution - a.contribution ||
            SIGNALS.indexOf(a.signal) - SIGNALS.indexOf(b.signal) ||
            a.code.localeCompare(b.code)
    );

    return {
        score,
        tier,
        subScores,
        reasons,
        missingSignals,
        firingSignals,
        corroborationCapped,
        coverage,
        modelVersion: cfg.version,
    };
}

// =====================================================================
// Flag lifecycle decision
// =====================================================================

export function decideFlagAction(
    result: RiskResult,
    openFlag: OpenFlagSnapshot | null,
    lastFalseFlag: FalseFlagSnapshot | null,
    asOf: string,
    cfg: RiskConfig = RISK_CONFIG
): FlagDecision {
    if (openFlag) {
        if (result.tier !== "LOW" && tierRank(result.tier) > tierRank(openFlag.tier)) {
            return { action: "ESCALATE", reason: "TIER_ESCALATED" };
        }
        return { action: "NONE", reason: "OPEN_FLAG_EXISTS" };
    }

    if (result.tier === "LOW") {
        return { action: "NONE", reason: "BELOW_THRESHOLD" };
    }

    if (lastFalseFlag) {
        const daysSinceReview = calendarDaysDifferenceIST(lastFalseFlag.reviewedAt, asOf);
        const withinCooldown = daysSinceReview < cfg.cooldownDays;
        const notMateriallyWorse = result.score < lastFalseFlag.score + cfg.cooldownScoreDelta;
        if (withinCooldown && notMateriallyWorse) {
            return { action: "NONE", reason: "COOLDOWN" };
        }
    }

    return { action: "CREATE", reason: "NEW_FLAG" };
}

// =====================================================================
// Explanations (counsellor-facing, English)
// =====================================================================

function sentenceFor(reason: RiskReason): string {
    const o = reason.observed;
    switch (reason.code) {
        case "FEE_OVERDUE":
            return o.overdueInstalments > 1
                ? `${o.overdueInstalments} fee instalments are overdue, the oldest by ${o.maxDaysOverdue} days.`
                : `${o.overdueInstalments} fee instalment is overdue by ${o.maxDaysOverdue} days.`;
        case "ATTENDANCE_LOW":
            return `Attended ${o.attendancePct}% of the last ${o.records} recorded classes.`;
        case "ATTENDANCE_DROP":
            return `Attendance fell from ${o.fromPct}% to ${o.toPct}% across recent classes.`;
        case "ATTENDANCE_STREAK":
            return `Absent for the last ${o.classes} consecutive recorded classes.`;
        case "SCORE_DROP":
            return `Latest test score is ${o.latestPct}%, down from an earlier average of ${o.previousAvgPct}%.`;
        case "SCORE_LOW":
            return `Latest test score is ${o.latestPct}%.`;
    }
}

export function renderExplanation(reasons: RiskReason[], maxSentences = 2): string {
    if (reasons.length === 0) return "No warning signs above threshold as of this evaluation.";
    return reasons.slice(0, maxSentences).map(sentenceFor).join(" ");
}

const MAX_EXPLANATION_CHARS = 320;
const MAX_EXPLANATION_SENTENCES = 2;

const BANNED_PATTERNS: readonly RegExp[] = [
    /\bwill\s+(?:likely\s+|probably\s+)?(?:drop|leave|quit|fail)/i,
    /\b(?:likely|going|expected)\s+to\s+(?:drop|leave|quit|fail)/i,
    /\bdrop(?:-|\s)?out\b/i,
    /\b(?:lazy|careless|unmotivated|irresponsible|defaulter|hopeless)\b/i,
    /\b(?:caste|religion|poverty|poor family)\b/i,
];

export function validateLlmExplanation(text: string, reasons: RiskReason[]): ExplanationCheck {
    const problems: string[] = [];
    const trimmed = text.trim();

    if (!trimmed) problems.push("EMPTY");
    if (trimmed.length > MAX_EXPLANATION_CHARS) problems.push("TOO_LONG");

    const sentences = trimmed.split(/(?<=[.!?])\s+/).filter(Boolean);
    if (sentences.length > MAX_EXPLANATION_SENTENCES) problems.push("TOO_MANY_SENTENCES");

    for (const pattern of BANNED_PATTERNS) {
        if (pattern.test(trimmed)) problems.push(`BANNED_PHRASE:${pattern.source}`);
    }

    const allowedNumbers = new Set(
        reasons.flatMap((r) => Object.values(r.observed).map((n) => String(n)))
    );
    for (const num of trimmed.match(/\d+/g) ?? []) {
        if (!allowedNumbers.has(num)) problems.push(`UNKNOWN_NUMBER:${num}`);
    }

    return { ok: problems.length === 0, problems };
}

export const RISK_EXPLAIN_PROMPT_VERSION = "risk-explain-v1";

/**
 * The ONLY data an external LLM may receive: reason codes and observed numbers.
 * No name, student ID, phone, centre or batch ever leaves the system.
 */
export function buildLlmPayload(reasons: RiskReason[]): LlmPayload {
    return {
        promptVersion: RISK_EXPLAIN_PROMPT_VERSION,
        instructions:
            "Rewrite these observations for a school counsellor in at most 2 plain sentences. " +
            "Describe only what was observed. Do not predict outcomes, judge the student, " +
            "or use any number that is not in the input.",
        reasons: reasons.map(({ code, observed }) => ({ code, observed })),
    };
}