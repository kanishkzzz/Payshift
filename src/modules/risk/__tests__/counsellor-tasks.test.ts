import { describe, it, expect } from "vitest";
import { RiskService } from "../risk-service";
import type { StaffActor } from "../types";

const adminActor: StaffActor = {
    id: "usr_admin_01",
    role: "ADMIN",
    centreId: null,
};

describe.skipIf(!process.env.DATABASE_URL)("CounsellorTasks Priority & Sorting (seeded DB)", () => {
    it("derives priority from risk flag tier and sorts High first then dueDate asc", async () => {
        const tasks = await RiskService.listTasks(adminActor);
        expect(tasks.length).toBeGreaterThanOrEqual(1);

        // Verify structure: student name + batch, riskFlag with tier and score, computed priority
        for (const t of tasks) {
            expect(t.student).toBeDefined();
            expect(t.student.name).toBeDefined();
            expect(t.student.batch).toBeDefined();
            expect(t.student.batch.name).toBeDefined();
            expect(["High", "Medium", "Normal"]).toContain(t.priority);

            if (t.riskFlag?.tier === "HIGH") {
                expect(t.priority).toBe("High");
            } else if (t.riskFlag?.tier === "MEDIUM") {
                expect(t.priority).toBe("Medium");
            } else {
                expect(t.priority).toBe("Normal");
            }
        }

        // Verify sorting: High before Medium, Medium before Normal
        const priorityRank = { High: 1, Medium: 2, Normal: 3 };
        for (let i = 0; i < tasks.length - 1; i++) {
            const current = tasks[i];
            const next = tasks[i + 1];
            const currentRank = priorityRank[current.priority];
            const nextRank = priorityRank[next.priority];

            expect(currentRank).toBeLessThanOrEqual(nextRank);
            if (currentRank === nextRank) {
                expect(new Date(current.dueDate).getTime()).toBeLessThanOrEqual(new Date(next.dueDate).getTime());
            }
        }
    });
});

