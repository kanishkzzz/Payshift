/**
 * Dropout-risk domain types.
 * Shared by risk-math (pure) and risk-service (I/O). No executable code except constant lists.
 */
import type { UserRole } from "@prisma/client";

export type Signal = "fee" | "attendance" | "academic";
export type Tier = "LOW" | "MEDIUM" | "HIGH";

export type ReasonCode =
    | "FEE_OVERDUE"
    | "ATTENDANCE_LOW"
    | "ATTENDANCE_DROP"
    | "ATTENDANCE_STREAK"
    | "SCORE_DROP"
    | "SCORE_LOW";

export const FALSE_FLAG_REASONS = [
    "MEDICAL_LEAVE",
    "FEE_ARRANGEMENT_AGREED",
    "FAMILY_EVENT",
    "DATA_ERROR",
    "ALREADY_SUPPORTED",
    "OTHER",
] as const;
export type FalseFlagReason = (typeof FALSE_FLAG_REASONS)[number];

/** Bands are evaluated highest-threshold first; first match wins. */
export interface MinBand {
    min: number;
    score: number;
}
/** Evaluated lowest-threshold first; first match (value < below) wins. */
export interface BelowBand {
    below: number;
    score: number;
}

export interface RiskConfig {
    version: string;
    /** Integer weights summing to 100 (avoids float drift at tier boundaries). */
    weights: Record<Signal, number>;
    tiers: { medium: number; high: number };
    /** A sub-score at or above this counts as a "firing" signal. */
    firingThreshold: number;
    /** HIGH requires at least this many firing signals (corroboration rule). */
    minSignalsForHigh: number;
    fee: { bands: MinBand[]; multipleOverdueBonus: number };
    attendance: {
        lookbackDays: number;
        minRecords: number;
        minRecordsForTrend: number;
        absenceBands: MinBand[];
        dropBands: MinBand[];
        streakBands: MinBand[];
    };
    academic: {
        maxTests: number;
        minTests: number;
        dropBands: MinBand[];
        lowBands: BelowBand[];
    };
    cooldownDays: number;
    cooldownScoreDelta: number;
    taskDueDays: number;
}

// ---------- Raw inputs (plain objects, already loaded by the service) ----------

export interface RiskInstalmentRow {
    id: string;
    dueDate: Date | string;
    amountPaise: bigint;
    paidPaise: bigint;
    graceDays: number;
}

export interface RiskAttendanceRow {
    date: Date | string;
    present: boolean;
}

export interface RiskTestRow {
    date: Date | string;
    score: number;
    maxScore: number;
}

export interface RiskRawInput {
    instalments: RiskInstalmentRow[];
    attendance: RiskAttendanceRow[];
    tests: RiskTestRow[];
}

// ---------- Features ----------

export interface FeeFeatures {
    dataSufficient: boolean;
    instalments: number;
    overdueInstalments: number;
    maxDaysOverdue: number;
}

export interface AttendanceFeatures {
    dataSufficient: boolean;
    records: number;
    attendancePct: number | null;
    absencePct: number | null;
    earlierPct: number | null;
    recentPct: number | null;
    dropPct: number | null;
    trailingAbsenceStreak: number;
}

export interface AcademicFeatures {
    dataSufficient: boolean;
    tests: number;
    latestPct: number | null;
    previousAvgPct: number | null;
    dropPct: number | null;
}

export interface FeatureVector {
    asOf: string;
    fee: FeeFeatures;
    attendance: AttendanceFeatures;
    academic: AcademicFeatures;
}

// ---------- Scoring output ----------

export type SubScores = Record<Signal, number | null>;

export interface RiskReason {
    code: ReasonCode;
    signal: Signal;
    componentScore: number;
    /** componentScore × signal weight; used only for ordering. */
    contribution: number;
    /** Observed numbers only. These are the only numbers an explanation may contain. */
    observed: Record<string, number>;
}

export interface RiskResult {
    score: number;
    tier: Tier;
    subScores: SubScores;
    reasons: RiskReason[];
    missingSignals: Signal[];
    firingSignals: number;
    corroborationCapped: boolean;
    coverage: number;
    modelVersion: string;
}

// ---------- Flag lifecycle ----------

export interface OpenFlagSnapshot {
    tier: Tier;
    score: number;
}

export interface FalseFlagSnapshot {
    score: number;
    reviewedAt: Date | string;
}

export type FlagDecision =
    | { action: "CREATE"; reason: "NEW_FLAG" }
    | { action: "ESCALATE"; reason: "TIER_ESCALATED" }
    | { action: "NONE"; reason: "BELOW_THRESHOLD" | "OPEN_FLAG_EXISTS" | "COOLDOWN" };

export interface ExplanationCheck {
    ok: boolean;
    problems: string[];
}

export interface LlmPayload {
    promptVersion: string;
    instructions: string;
    reasons: Array<{ code: ReasonCode; observed: Record<string, number> }>;
}

// ---------- Service-facing ----------

export interface StaffActor {
    id: string;
    role: UserRole;
    centreId: string | null;
}

export type TaskPriority = "High" | "Medium" | "Normal";

export interface EvaluationOutcome {
    studentId: string;
    result: RiskResult;
    decision: FlagDecision;
    flagId: string | null;
    taskId: string | null;
}

export interface RiskRunSummary {
    asOf: string;
    modelVersion: string;
    evaluated: number;
    created: number;
    escalated: number;
    unchanged: number;
    cooldown: number;
    tasksCreated: number;
    failed: Array<{ studentId: string; error: string }>;
}