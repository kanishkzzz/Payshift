import { prisma } from "@/lib/prisma";
import { toISTCalendarDateString } from "@/modules/ledger/date-utils";
import { getMessageChannel } from "../channels";
import {
    addDaysToISTDate,
    getReminderWindow,
    isReminderStale,
    isReminderTemplateKey,
    istMidnight,
    planRemindersForDate,
} from "../reminder-rules";
import { renderTemplate } from "../templates";
import type { ReminderLang, ReminderRunSummary } from "../types";

const ZERO = BigInt(0);
const HUNDRED = BigInt(100);
const DISPATCH_BATCH_LIMIT = 500;

type DeliveryLog = { guardianId: string; ok: boolean; providerRef?: string; error?: string };

function sumPaise(rows: Array<{ amountPaise: bigint }>): bigint {
    return rows.reduce((sum, r) => sum + r.amountPaise, ZERO);
}

function remainingPaise(amountPaise: bigint, allocations: Array<{ amountPaise: bigint }>): bigint {
    const paid = sumPaise(allocations);
    return amountPaise > paid ? amountPaise - paid : ZERO;
}

/** Latest consent decides: if it was withdrawn, no automated messages. No record = not withdrawn. */
function hasWithdrawnConsent(consents: Array<{ withdrawnAt: Date | null }>): boolean {
    const latest = consents[0];
    return Boolean(latest && latest.withdrawnAt !== null);
}

/** Only flips a reminder that is still SCHEDULED, so concurrent runs never overwrite each other. */
async function closeReminder(
    id: string,
    status: "SUPPRESSED_PAID" | "CANCELLED",
    reason: string
): Promise<boolean> {
    const res = await prisma.reminder.updateMany({
        where: { id, status: "SCHEDULED" },
        data: { status, responseLog: JSON.stringify({ reason }) },
    });
    return res.count > 0;
}

export class ReminderService {
    /**
     * Phase A: create reminder rows due as of `today`.
     * Idempotent: UNIQUE(instalment_id, template_key, scheduled_for) + skipDuplicates.
     */
    static async scheduleReminders(today: Date | string = new Date()): Promise<number> {
        const todayStr = toISTCalendarDateString(today);
        const { fromDueDate, toDueDate } = getReminderWindow(todayStr);

        // Query a day wider on each side; the pure planner does the exact IST filtering.
        const instalments = await prisma.instalment.findMany({
            where: {
                dueDate: {
                    gte: istMidnight(addDaysToISTDate(fromDueDate, -1)),
                    lte: istMidnight(addDaysToISTDate(toDueDate, 1)),
                },
                enrollment: { student: { status: "ACTIVE" } },
            },
            select: {
                id: true,
                dueDate: true,
                amountPaise: true,
                allocations: { select: { amountPaise: true } },
            },
        });

        const planned = planRemindersForDate(
            instalments.map((i) => ({
                id: i.id,
                dueDate: i.dueDate,
                remainingPaise: remainingPaise(i.amountPaise, i.allocations),
            })),
            todayStr
        );

        if (planned.length === 0) return 0;

        const channelName = getMessageChannel().name;
        const result = await prisma.reminder.createMany({
            data: planned.map((p) => ({
                instalmentId: p.instalmentId,
                templateKey: p.templateKey,
                scheduledFor: istMidnight(p.scheduledFor),
                status: "SCHEDULED" as const,
                channel: channelName,
            })),
            skipDuplicates: true,
        });

        return result.count;
    }

    /**
     * Phase B: send SCHEDULED reminders up to `today`.
     * Checks, in order: paid -> student left -> stale -> consent -> claim -> send.
     */
    static async dispatchReminders(
        today: Date | string = new Date()
    ): Promise<Omit<ReminderRunSummary, "date" | "scheduled">> {
        const todayStr = toISTCalendarDateString(today);
        const channel = getMessageChannel();
        const payLink = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/parent/dues`;
        const instituteName = process.env.INSTITUTE_NAME || "Tracky";

        const counts = { sent: 0, suppressedPaid: 0, cancelled: 0, failed: 0, skipped: 0 };

        const reminders = await prisma.reminder.findMany({
            where: { status: "SCHEDULED", scheduledFor: { lte: istMidnight(todayStr) } },
            orderBy: { scheduledFor: "asc" },
            take: DISPATCH_BATCH_LIMIT,
            include: {
                instalment: {
                    include: {
                        allocations: { select: { amountPaise: true } },
                        enrollment: {
                            include: {
                                student: {
                                    include: {
                                        guardians: {
                                            include: {
                                                consents: {
                                                    orderBy: { grantedAt: "desc" },
                                                    take: 1,
                                                    select: { withdrawnAt: true },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        for (const reminder of reminders) {
            const instalment = reminder.instalment;
            const student = instalment.enrollment.student;

            // 1. Stop-on-paid: re-check the derived balance right before sending
            const remaining = remainingPaise(instalment.amountPaise, instalment.allocations);
            if (remaining <= ZERO) {
                if (await closeReminder(reminder.id, "SUPPRESSED_PAID", "Instalment fully paid before dispatch")) {
                    counts.suppressedPaid++;
                } else counts.skipped++;
                continue;
            }

            // 2. Student has left
            if (student.status !== "ACTIVE") {
                if (await closeReminder(reminder.id, "CANCELLED", "Student is not active")) counts.cancelled++;
                else counts.skipped++;
                continue;
            }

            // 3. Unknown template or stale reminder
            if (!isReminderTemplateKey(reminder.templateKey)) {
                if (await closeReminder(reminder.id, "CANCELLED", `Unknown template "${reminder.templateKey}"`)) {
                    counts.cancelled++;
                } else counts.skipped++;
                continue;
            }
            const templateKey = reminder.templateKey;

            if (isReminderStale(reminder.scheduledFor, todayStr)) {
                if (await closeReminder(reminder.id, "CANCELLED", "Stale: scheduled date has passed")) {
                    counts.cancelled++;
                } else counts.skipped++;
                continue;
            }

            // 4. Recipients: guardians with a phone and no withdrawn consent (DPDP)
            const recipients = student.guardians.filter(
                (g) => g.phone && !hasWithdrawnConsent(g.consents)
            );
            if (recipients.length === 0) {
                if (await closeReminder(reminder.id, "CANCELLED", "No guardian with active consent")) {
                    counts.cancelled++;
                } else counts.skipped++;
                continue;
            }

            // 5. Claim before sending: at-most-once delivery even if two runs overlap
            const claimed = await prisma.reminder.updateMany({
                where: { id: reminder.id, status: "SCHEDULED" },
                data: { status: "SENT", sentAt: new Date() },
            });
            if (claimed.count === 0) {
                counts.skipped++;
                continue;
            }

            // 6. Send to each recipient
            const dueDateStr = toISTCalendarDateString(instalment.dueDate);
            const amountRupee = Number(remaining / HUNDRED);
            const logs: DeliveryLog[] = [];

            for (const guardian of recipients) {
                const lang: ReminderLang = guardian.preferredLang === "HI" ? "HI" : "EN";
                try {
                    const body = renderTemplate(templateKey, lang, {
                        guardianName: guardian.name,
                        studentName: student.name,
                        amountRupee,
                        dueDate: dueDateStr,
                        payLink,
                        instituteName,
                    });
                    const result = await channel.send({
                        reminderId: reminder.id,
                        guardianId: guardian.id,
                        to: guardian.phone,
                        body,
                        lang,
                        templateKey,
                    });
                    logs.push({ guardianId: guardian.id, ...result });
                } catch (err) {
                    logs.push({
                        guardianId: guardian.id,
                        ok: false,
                        error: err instanceof Error ? err.message : "Unknown send error",
                    });
                }
            }

            const anyDelivered = logs.some((l) => l.ok);
            await prisma.reminder.update({
                where: { id: reminder.id },
                data: {
                    status: anyDelivered ? "SENT" : "FAILED",
                    sentAt: anyDelivered ? new Date() : null,
                    responseLog: JSON.stringify(logs),
                },
            });

            if (anyDelivered) counts.sent++;
            else counts.failed++;
        }

        return counts;
    }

    /** Daily job: schedule, then dispatch, then audit. */
    static async runDailyReminders(today: Date | string = new Date()): Promise<ReminderRunSummary> {
        const date = toISTCalendarDateString(today);
        const scheduled = await ReminderService.scheduleReminders(date);
        const dispatched = await ReminderService.dispatchReminders(date);
        const summary: ReminderRunSummary = { date, scheduled, ...dispatched };

        await prisma.auditLog.create({
            data: {
                actorId: "SYSTEM_CRON",
                action: "REMINDER_RUN",
                entityType: "REMINDER_RUN",
                entityId: date,
                afterState: { ...summary },
            },
        });

        console.log(
            `[Reminders] ${date}: scheduled=${scheduled} sent=${dispatched.sent} suppressed=${dispatched.suppressedPaid} cancelled=${dispatched.cancelled} failed=${dispatched.failed}`
        );
        return summary;
    }
}