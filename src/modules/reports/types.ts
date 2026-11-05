export type AgeingBucket = "CURRENT" | "CRITICAL" | "DEFAULT_RISK";

export const AGEING_BUCKET_LABELS: Record<AgeingBucket, string> = {
    CURRENT: "Current (0–30 days)",
    CRITICAL: "Critical (31–60 days)",
    DEFAULT_RISK: "Default risk (60+ days)",
};

/** HLD target: less than 12% of total dues should be over 60 days. */
export const OVER_60_TARGET_PERCENT = 12;

export type BucketTotals = Record<AgeingBucket, bigint>;

export interface DuesInstalmentInput {
    instalmentId: string;
    studentId: string;
    studentName: string;
    batchId: string;
    batchName: string;
    centreId: string;
    centreName: string;
    dueDate: Date | string;
    outstandingPaise: bigint;
}

export interface DuesGroupSummary {
    id: string;
    name: string;
    outstandingPaise: bigint;
    overduePaise: bigint;
    buckets: BucketTotals;
    overdueStudentCount: number;
}

export interface StudentDuesRow {
    studentId: string;
    studentName: string;
    batchName: string;
    centreName: string;
    outstandingPaise: bigint;
    overduePaise: bigint;
    maxDaysOverdue: number;
    bucket: AgeingBucket | null;
}

export interface DuesSummary {
    asOf: string;
    totalOutstandingPaise: bigint;
    totalOverduePaise: bigint;
    notYetDuePaise: bigint;
    buckets: BucketTotals;
    over60Percent: number;
    meetsTarget: boolean;
    byCentre: DuesGroupSummary[];
    byBatch: DuesGroupSummary[];
    students: StudentDuesRow[]; // overdue students only, worst first
}

export interface TallyReceiptRow {
    date: Date | string;
    receiptNo: string;
    studentId: string;
    studentName: string;
    amountPaise: bigint;
    taxablePaise: bigint;
    gstPaise: bigint;
    gstin: string;
    paymentRef: string | null;
    source: string;
}