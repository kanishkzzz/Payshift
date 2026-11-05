import { calendarDaysDifferenceIST, toISTCalendarDateString } from "@/modules/ledger/date-utils";
import {
    OVER_60_TARGET_PERCENT,
    type AgeingBucket,
    type BucketTotals,
    type DuesGroupSummary,
    type DuesInstalmentInput,
    type DuesSummary,
    type StudentDuesRow,
    type TallyReceiptRow,
} from "./types";

const ZERO = BigInt(0);
const HUNDRED = BigInt(100);
const TWO = BigInt(2);

const emptyBuckets = (): BucketTotals => ({ CURRENT: ZERO, CRITICAL: ZERO, DEFAULT_RISK: ZERO });

/** Days past due date -> bucket. 0 or less = not overdue. */
export function bucketForDays(daysOverdue: number): AgeingBucket | null {
    if (daysOverdue <= 0) return null;
    if (daysOverdue <= 30) return "CURRENT";
    if (daysOverdue <= 60) return "CRITICAL";
    return "DEFAULT_RISK";
}

/** Pure dues aggregation. Ageing is counted from the due date (IST calendar days). */
export function buildDuesSummary(rows: DuesInstalmentInput[], asOf: Date | string): DuesSummary {
    const asOfStr = toISTCalendarDateString(asOf);
    const buckets = emptyBuckets();
    let totalOutstanding = ZERO;
    let notYetDue = ZERO;

    const centres = new Map<string, DuesGroupSummary & { students: Set<string> }>();
    const batches = new Map<string, DuesGroupSummary & { students: Set<string> }>();
    const students = new Map<string, StudentDuesRow>();

    const group = (map: typeof centres, id: string, name: string) => {
        let g = map.get(id);
        if (!g) {
            g = { id, name, outstandingPaise: ZERO, overduePaise: ZERO, buckets: emptyBuckets(), overdueStudentCount: 0, students: new Set() };
            map.set(id, g);
        }
        return g;
    };

    for (const row of rows) {
        if (row.outstandingPaise <= ZERO) continue;

        const days = calendarDaysDifferenceIST(row.dueDate, asOfStr);
        const bucket = bucketForDays(days);
        const centre = group(centres, row.centreId, row.centreName);
        const batch = group(batches, row.batchId, row.batchName);

        totalOutstanding += row.outstandingPaise;
        centre.outstandingPaise += row.outstandingPaise;
        batch.outstandingPaise += row.outstandingPaise;

        let student = students.get(row.studentId);
        if (!student) {
            student = {
                studentId: row.studentId,
                studentName: row.studentName,
                batchName: row.batchName,
                centreName: row.centreName,
                outstandingPaise: ZERO,
                overduePaise: ZERO,
                maxDaysOverdue: 0,
                bucket: null,
            };
            students.set(row.studentId, student);
        }
        student.outstandingPaise += row.outstandingPaise;

        if (!bucket) {
            notYetDue += row.outstandingPaise;
            continue;
        }

        buckets[bucket] += row.outstandingPaise;
        for (const g of [centre, batch]) {
            g.overduePaise += row.outstandingPaise;
            g.buckets[bucket] += row.outstandingPaise;
            g.students.add(row.studentId);
        }
        student.overduePaise += row.outstandingPaise;
        if (days > student.maxDaysOverdue) {
            student.maxDaysOverdue = days;
            student.bucket = bucket;
        }
    }

    const totalOverdue = buckets.CURRENT + buckets.CRITICAL + buckets.DEFAULT_RISK;
    // basis points with integer math, then to a 2-decimal percentage
    const over60Percent =
        totalOutstanding > ZERO ? Number((buckets.DEFAULT_RISK * BigInt(10000)) / totalOutstanding) / 100 : 0;

    const finish = (map: typeof centres): DuesGroupSummary[] =>
        [...map.values()]
            .map(({ students: s, ...g }) => ({ ...g, overdueStudentCount: s.size }))
            .sort((a, b) => (b.overduePaise > a.overduePaise ? 1 : b.overduePaise < a.overduePaise ? -1 : 0));

    return {
        asOf: asOfStr,
        totalOutstandingPaise: totalOutstanding,
        totalOverduePaise: totalOverdue,
        notYetDuePaise: notYetDue,
        buckets,
        over60Percent,
        meetsTarget: over60Percent < OVER_60_TARGET_PERCENT,
        byCentre: finish(centres),
        byBatch: finish(batches),
        students: [...students.values()]
            .filter((s) => s.overduePaise > ZERO)
            .sort((a, b) => b.maxDaysOverdue - a.maxDaysOverdue || (b.overduePaise > a.overduePaise ? 1 : -1)),
    };
}

// ---------------- Tally CSV ----------------

/** 1500050 -> "15000.50" (exact, no floats). */
export function paiseToDecimal(paise: bigint): string {
    const negative = paise < ZERO;
    const abs = negative ? -paise : paise;
    return `${negative ? "-" : ""}${abs / HUNDRED}.${(abs % HUNDRED).toString().padStart(2, "0")}`;
}

/** Quotes when needed and neutralises spreadsheet formula injection (=, +, -, @). */
export function csvCell(value: string): string {
    let v = value;
    if (/^[=+\-@]/.test(v)) v = `'${v}`;
    return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const TALLY_HEADER = [
    "Voucher Type", "Date", "Voucher No", "Party Ledger", "Income Ledger",
    "Amount", "Taxable Value", "CGST", "SGST", "Institute GSTIN", "Reference", "Narration",
];

/** One Receipt voucher per row. GST split equally into CGST/SGST; odd paisa goes to SGST. */
export function buildTallyCsv(rows: TallyReceiptRow[]): string {
    const lines = [TALLY_HEADER.join(",")];

    for (const r of rows) {
        const [y, m, d] = toISTCalendarDateString(r.date).split("-");
        const cgst = r.gstPaise / TWO;
        const sgst = r.gstPaise - cgst;

        lines.push(
            [
                "Receipt",
                `${d}-${m}-${y}`,
                r.receiptNo,
                `${r.studentName} (${r.studentId})`,
                "Tuition Fee Income",
                paiseToDecimal(r.amountPaise),
                paiseToDecimal(r.taxablePaise),
                paiseToDecimal(cgst),
                paiseToDecimal(sgst),
                r.gstin,
                r.paymentRef ?? "",
                `Fee received via ${r.source}`,
            ]
                .map(csvCell)
                .join(",")
        );
    }

    return lines.join("\r\n");
}