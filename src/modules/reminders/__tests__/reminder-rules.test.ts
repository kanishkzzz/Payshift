import { describe, it, expect } from "vitest";
import {
    addDaysToISTDate,
    getReminderWindow,
    isReminderStale,
    planRemindersForDate,
} from "../reminder-rules";
import { renderTemplate, formatDueDate, getTemplate } from "../templates";
import { REMINDER_TEMPLATE_KEYS } from "../types";

const open = (id: string, dueDate: string, remaining = 1_500_000) => ({
    id,
    dueDate,
    remainingPaise: BigInt(remaining),
});

describe("addDaysToISTDate", () => {
    it("crosses month and year boundaries", () => {
        expect(addDaysToISTDate("2026-10-30", 3)).toBe("2026-11-02");
        expect(addDaysToISTDate("2026-12-30", 3)).toBe("2027-01-02");
        expect(addDaysToISTDate("2026-11-15", -3)).toBe("2026-11-12");
    });
});

describe("planRemindersForDate", () => {
    const due = "2026-11-15";

    it.each([
        ["2026-11-12", "BEFORE_DUE", "2026-11-12"],
        ["2026-11-15", "ON_DUE", "2026-11-15"],
        ["2026-11-18", "AFTER_DUE", "2026-11-18"],
        ["2026-11-22", "ESCALATION", "2026-11-22"],
    ])("on %s plans %s", (today, key, scheduledFor) => {
        expect(planRemindersForDate([open("i1", due)], today)).toEqual([
            { instalmentId: "i1", templateKey: key, scheduledFor },
        ]);
    });

    it("catches up one day late with the SAME scheduledFor (dedup-safe)", () => {
        expect(planRemindersForDate([open("i1", due)], "2026-11-13")).toEqual([
            { instalmentId: "i1", templateKey: "BEFORE_DUE", scheduledFor: "2026-11-12" },
        ]);
    });

    it("plans nothing on in-between days", () => {
        for (const today of ["2026-11-11", "2026-11-14", "2026-11-17", "2026-11-20", "2026-11-24"]) {
            expect(planRemindersForDate([open("i1", due)], today)).toEqual([]);
        }
    });

    it("never plans reminders for fully paid instalments", () => {
        expect(planRemindersForDate([open("i1", due, 0)], "2026-11-15")).toEqual([]);
    });

    it("STU-0587 benchmark: 23 days overdue on 2026-11-02 gets no new reminder", () => {
        expect(planRemindersForDate([open("stu0587", "2026-10-10")], "2026-11-02")).toEqual([]);
    });

    it("respects IST boundary for DB timestamps (UTC 18:30 = next IST day)", () => {
        const dueAsUtc = new Date("2026-11-14T18:30:00.000Z"); // 15 Nov 00:00 IST
        const planned = planRemindersForDate(
            [{ id: "i1", dueDate: dueAsUtc, remainingPaise: BigInt(100) }],
            "2026-11-12"
        );
        expect(planned[0]?.templateKey).toBe("BEFORE_DUE");
    });
});

describe("getReminderWindow / isReminderStale", () => {
    it("computes the due-date window for a given day", () => {
        expect(getReminderWindow("2026-11-12")).toEqual({
            fromDueDate: "2026-11-04",
            toDueDate: "2026-11-15",
        });
    });

    it("marks reminders older than the catch-up window as stale", () => {
        expect(isReminderStale("2026-11-12", "2026-11-13")).toBe(false);
        expect(isReminderStale("2026-11-12", "2026-11-14")).toBe(true);
    });
});

describe("templates", () => {
    const vars = {
        guardianName: "Sunita",
        studentName: "Aarav",
        amountRupee: 15000,
        dueDate: "2026-11-15",
        payLink: "https://tracky.test/parent/dues",
        instituteName: "Tracky",
    };

    it("every template key exists in both EN and HI", () => {
        for (const key of REMINDER_TEMPLATE_KEYS) {
            expect(getTemplate(key, "EN")).toBeTruthy();
            expect(getTemplate(key, "HI")).toBeTruthy();
        }
    });

    it("renders EN with Indian number formatting", () => {
        const msg = renderTemplate("BEFORE_DUE", "EN", vars);
        expect(msg).toContain("₹15,000");
        expect(msg).toContain("15 Nov 2026");
        expect(msg).not.toMatch(/\{\w+\}/);
    });

    it("renders HI", () => {
        const msg = renderTemplate("ON_DUE", "HI", vars);
        expect(msg).toContain("₹15,000");
        expect(msg).toContain("15/11/2026");
        expect(msg).toContain("प्रिय Sunita");
    });

    it("throws instead of sending a message with an empty variable", () => {
        expect(() => renderTemplate("ON_DUE", "EN", { ...vars, payLink: "" })).toThrow();
    });

    it("formats dates per language", () => {
        expect(formatDueDate("2026-10-10", "EN")).toBe("10 Oct 2026");
        expect(formatDueDate("2026-10-10", "HI")).toBe("10/10/2026");
    });
});