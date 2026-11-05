/**
 * Pure reminder planning rules. Zero database calls.
 * All dates are IST calendar dates (YYYY-MM-DD).
 */

import {
    calendarDaysDifferenceIST,
    parseISTDateParts,
    toISTCalendarDateString,
} from "@/modules/ledger/date-utils";
import {
    DEFAULT_CATCH_UP_DAYS,
    DEFAULT_REMINDER_RULES,
    REMINDER_TEMPLATE_KEYS,
    type PlannedReminder,
    type ReminderCandidateInstalment,
    type ReminderOffsetRule,
    type ReminderTemplateKey,
} from "./types";

const ZERO = BigInt(0);

/** Adds whole calendar days to an IST date. Returns "YYYY-MM-DD". */
export function addDaysToISTDate(input: Date | string, days: number): string {
    if (!Number.isSafeInteger(days)) {
        throw new Error(`days must be a safe integer, received: ${days}`);
    }
    const { year, month, day } = parseISTDateParts(input);
    const d = new Date(Date.UTC(year, month - 1, day + days));
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

/** Converts an IST calendar date to the DateTime stored in the DB (IST midnight). */
export function istMidnight(dateStr: string): Date {
    return new Date(`${toISTCalendarDateString(dateStr)}T00:00:00+05:30`);
}

export function isReminderTemplateKey(value: string): value is ReminderTemplateKey {
    return (REMINDER_TEMPLATE_KEYS as readonly string[]).includes(value);
}

/**
 * Plans which reminders should exist as of `today`.
 * - Only instalments with a remaining balance get reminders.
 * - scheduledFor is the INTENDED date (dueDate + offset), so re-running on the
 *   same or next day produces the same row and the DB unique constraint dedups it.
 * - A reminder is planned if today is within [intended, intended + catchUpDays].
 */
export function planRemindersForDate(
    instalments: ReminderCandidateInstalment[],
    today: Date | string,
    rules: ReminderOffsetRule[] = DEFAULT_REMINDER_RULES,
    catchUpDays: number = DEFAULT_CATCH_UP_DAYS
): PlannedReminder[] {
    if (!Number.isSafeInteger(catchUpDays) || catchUpDays < 0) {
        throw new Error(`catchUpDays must be a non-negative safe integer, received: ${catchUpDays}`);
    }

    const todayStr = toISTCalendarDateString(today);
    const planned: PlannedReminder[] = [];

    for (const inst of instalments) {
        if (inst.remainingPaise <= ZERO) continue;

        for (const rule of rules) {
            const intended = addDaysToISTDate(inst.dueDate, rule.offsetDays);
            const lagDays = calendarDaysDifferenceIST(intended, todayStr);
            if (lagDays >= 0 && lagDays <= catchUpDays) {
                planned.push({
                    instalmentId: inst.id,
                    templateKey: rule.templateKey,
                    scheduledFor: intended,
                });
            }
        }
    }

    return planned;
}

/**
 * Due-date range (inclusive) that can produce a reminder on `today`.
 * Used to keep the DB query small.
 */
export function getReminderWindow(
    today: Date | string,
    rules: ReminderOffsetRule[] = DEFAULT_REMINDER_RULES,
    catchUpDays: number = DEFAULT_CATCH_UP_DAYS
): { fromDueDate: string; toDueDate: string } {
    const offsets = rules.map((r) => r.offsetDays);
    const maxOffset = Math.max(...offsets);
    const minOffset = Math.min(...offsets);
    const todayStr = toISTCalendarDateString(today);

    return {
        fromDueDate: addDaysToISTDate(todayStr, -maxOffset - catchUpDays),
        toDueDate: addDaysToISTDate(todayStr, -minOffset),
    };
}

/** A reminder older than maxLagDays should not be sent (e.g. a "due in 3 days" text after the due date). */
export function isReminderStale(
    scheduledFor: Date | string,
    today: Date | string,
    maxLagDays: number = DEFAULT_CATCH_UP_DAYS
): boolean {
    return calendarDaysDifferenceIST(scheduledFor, today) > maxLagDays;
}