import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { toISTCalendarDateString } from "@/modules/ledger/date-utils";
import { ReminderService } from "../services/reminder-service";
import { MockMessageChannel, setTestMessageChannel } from "../channels";
import { istMidnight } from "../reminder-rules";

const RUN_DATE = "2026-11-12"; // T-3 for STU-0219 (due 2026-11-15)

async function findInstalment(studentId: string, opts: { dueDate?: string; paid: boolean }) {
    const instalments = await prisma.instalment.findMany({
        where: { enrollment: { studentId } },
        include: { allocations: { select: { amountPaise: true } } },
    });
    return instalments.find((i) => {
        const paid = i.allocations.reduce((s, a) => s + a.amountPaise, BigInt(0));
        const isPaid = paid >= i.amountPaise;
        const dateOk = opts.dueDate ? toISTCalendarDateString(i.dueDate) === opts.dueDate : true;
        return isPaid === opts.paid && dateOk;
    });
}

describe.skipIf(!process.env.DATABASE_URL)("ReminderService (seeded DB)", () => {
    let channel: MockMessageChannel;
    const touchedInstalmentIds = new Set<string>();

    beforeAll(() => {
        channel = new MockMessageChannel();
        setTestMessageChannel(channel);
    });

    afterEach(async () => {
        if (touchedInstalmentIds.size > 0) {
            await prisma.reminder.deleteMany({
                where: { instalmentId: { in: [...touchedInstalmentIds] }, scheduledFor: istMidnight(RUN_DATE) },
            });
        }
        channel.sent.length = 0;
    });

    afterAll(() => {
        setTestMessageChannel(null);
    });

    it("scheduling twice on the same day creates zero duplicates", async () => {
        const inst = await findInstalment("STU-0219", { dueDate: "2026-11-15", paid: false });
        if (!inst) return console.warn("No open STU-0219 instalment due 2026-11-15 in seed; skipping.");
        touchedInstalmentIds.add(inst.id);

        await ReminderService.scheduleReminders(RUN_DATE);
        await ReminderService.scheduleReminders(RUN_DATE);

        const rows = await prisma.reminder.findMany({
            where: { instalmentId: inst.id, templateKey: "BEFORE_DUE", scheduledFor: istMidnight(RUN_DATE) },
        });
        expect(rows).toHaveLength(1);
        expect(rows[0].status).toBe("SCHEDULED");
    });

    it("dispatches once, and a second dispatch sends nothing", async () => {
        const inst = await findInstalment("STU-0219", { dueDate: "2026-11-15", paid: false });
        if (!inst) return;
        touchedInstalmentIds.add(inst.id);

        await ReminderService.scheduleReminders(RUN_DATE);
        await ReminderService.dispatchReminders(RUN_DATE);

        const row = await prisma.reminder.findFirst({
            where: { instalmentId: inst.id, templateKey: "BEFORE_DUE", scheduledFor: istMidnight(RUN_DATE) },
        });
        expect(row?.status).toBe("SENT");
        expect(channel.sent.filter((m) => m.reminderId === row?.id).length).toBeGreaterThan(0);

        channel.sent.length = 0;
        await ReminderService.dispatchReminders(RUN_DATE);
        expect(channel.sent.filter((m) => m.reminderId === row?.id)).toHaveLength(0);
    });

    it("stop-on-paid: a scheduled reminder for a paid instalment is suppressed, not sent", async () => {
        const inst = await findInstalment("STU-0412", { paid: true });
        if (!inst) return console.warn("No paid STU-0412 instalment in seed; skipping.");
        touchedInstalmentIds.add(inst.id);

        const reminder = await prisma.reminder.create({
            data: { instalmentId: inst.id, templateKey: "ON_DUE", scheduledFor: istMidnight(RUN_DATE), status: "SCHEDULED" },
        });

        await ReminderService.dispatchReminders(RUN_DATE);

        const after = await prisma.reminder.findUnique({ where: { id: reminder.id } });
        expect(after?.status).toBe("SUPPRESSED_PAID");
        expect(channel.sent.filter((m) => m.reminderId === reminder.id)).toHaveLength(0);
    });
});