import { describe, it, expect } from "vitest";
import { ReportsService } from "../reports-service";

// HLD §11: system test against the seeded benchmark.
describe.skipIf(!process.env.DATABASE_URL)("ReportsService (seeded DB)", () => {
    it("STU-0587 is in the 0–30 bucket with ₹15,000 outstanding as of 2026-11-02", async () => {
        const summary = await ReportsService.getDuesSummary({ asOf: "2026-11-02" });
        const stu = summary.students.find((s) => s.studentId === "STU-0587");

        expect(stu).toBeDefined();
        expect(stu?.bucket).toBe("CURRENT");
        expect(stu?.maxDaysOverdue).toBe(23);
        expect(stu?.outstandingPaise).toBe(BigInt(1_500_000));
    });
});