import { describe, it, expect } from "vitest";
import { bucketForDays, buildDuesSummary, buildTallyCsv, csvCell, paiseToDecimal } from "../reports-math";
import type { DuesInstalmentInput } from "../types";

const row = (over: Partial<DuesInstalmentInput>): DuesInstalmentInput => ({
    instalmentId: "i1",
    studentId: "STU-0587",
    studentName: "Benchmark Student",
    batchId: "b1",
    batchName: "JEE 2027 A",
    centreId: "c1",
    centreName: "Jaipur",
    dueDate: "2026-10-10",
    outstandingPaise: BigInt(1_500_000),
    ...over,
});

describe("bucketForDays", () => {
    it.each([
        [0, null], [1, "CURRENT"], [30, "CURRENT"], [31, "CRITICAL"],
        [60, "CRITICAL"], [61, "DEFAULT_RISK"],
    ] as const)("%i days -> %s", (days, bucket) => {
        expect(bucketForDays(days)).toBe(bucket);
    });
});

describe("buildDuesSummary", () => {
    it("HLD benchmark: STU-0587 is in 0–30 bucket with ₹15,000 outstanding", () => {
        const s = buildDuesSummary([row({})], "2026-11-02");
        expect(s.students[0]).toMatchObject({ studentId: "STU-0587", maxDaysOverdue: 23, bucket: "CURRENT" });
        expect(s.students[0].outstandingPaise).toBe(BigInt(1_500_000));
        expect(s.buckets.CURRENT).toBe(BigInt(1_500_000));
    });

    it("not-yet-due dues count as outstanding but not overdue", () => {
        const s = buildDuesSummary(
            [row({}), row({ instalmentId: "i2", studentId: "STU-0219", dueDate: "2026-11-15", outstandingPaise: BigInt(2_500_000) })],
            "2026-11-02"
        );
        expect(s.totalOutstandingPaise).toBe(BigInt(4_000_000));
        expect(s.totalOverduePaise).toBe(BigInt(1_500_000));
        expect(s.notYetDuePaise).toBe(BigInt(2_500_000));
        expect(s.students.map((x) => x.studentId)).toEqual(["STU-0587"]);
    });

    it("computes over-60 share and target", () => {
        const s = buildDuesSummary(
            [
                row({ outstandingPaise: BigInt(900_000) }),                                  // 23 days
                row({ instalmentId: "i2", studentId: "S2", dueDate: "2026-08-01", outstandingPaise: BigInt(100_000) }), // 93 days
            ],
            "2026-11-02"
        );
        expect(s.buckets.DEFAULT_RISK).toBe(BigInt(100_000));
        expect(s.over60Percent).toBe(10);
        expect(s.meetsTarget).toBe(true);
    });

    it("groups by centre and batch", () => {
        const s = buildDuesSummary(
            [row({}), row({ instalmentId: "i2", studentId: "S2", centreId: "c2", centreName: "Kota", batchId: "b2", batchName: "NEET" })],
            "2026-11-02"
        );
        expect(s.byCentre).toHaveLength(2);
        expect(s.byBatch.find((b) => b.id === "b2")?.overdueStudentCount).toBe(1);
    });

    it("ignores fully paid rows", () => {
        const s = buildDuesSummary([row({ outstandingPaise: BigInt(0) })], "2026-11-02");
        expect(s.totalOutstandingPaise).toBe(BigInt(0));
        expect(s.students).toHaveLength(0);
    });
});

describe("Tally CSV", () => {
    it("formats paise exactly", () => {
        expect(paiseToDecimal(BigInt(1_500_000))).toBe("15000.00");
        expect(paiseToDecimal(BigInt(5))).toBe("0.05");
    });

    it("escapes commas/quotes and blocks formula injection", () => {
        expect(csvCell('Sharma, "Raj"')).toBe('"Sharma, ""Raj"""');
        expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    });

    it("builds a receipt voucher row with CGST/SGST split", () => {
        const csv = buildTallyCsv([
            {
                date: "2026-11-02",
                receiptNo: "RCP-2026-JAI-0001",
                studentId: "STU-0587",
                studentName: "Aarav",
                amountPaise: BigInt(1_500_000),
                taxablePaise: BigInt(1_271_186),
                gstPaise: BigInt(228_815), // odd paisa
                gstin: "08AAAAA0000A1Z5",
                paymentRef: "pay_123",
                source: "ONLINE_GATEWAY",
            },
        ]);
        const [header, line] = csv.split("\r\n");
        expect(header.startsWith("Voucher Type,Date")).toBe(true);
        expect(line).toContain("02-11-2026");
        expect(line).toContain("15000.00");
        expect(line).toContain("1144.07,1144.08"); // CGST, SGST
    });
});