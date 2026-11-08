import crypto from "crypto";
import { NextResponse } from "next/server";
import { ReminderService } from "@/modules/reminders/services/reminder-service";
import { RiskService } from "@/modules/risk/risk-service";


function safeEqual(a: string, b: string): boolean {
    if (!a || !b) return false;
    const bufA = Buffer.from(a, "utf8");
    const bufB = Buffer.from(b, "utf8");
    return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Daily reminder job. Vercel Cron calls this with GET and
 * "Authorization: Bearer <CRON_SECRET>" when CRON_SECRET is set in the project env.
 *
 * Dev/test only: ?date=YYYY-MM-DD runs the job as if it were that IST date.
 */
async function handle(req: Request) {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
        console.error("[Cron] CRON_SECRET is not configured.");
        return NextResponse.json({ error: "CRON_NOT_CONFIGURED" }, { status: 500 });
    }

    const auth = req.headers.get("authorization") ?? "";
    const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
    if (!safeEqual(token, secret)) {
        return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const dateParam = new URL(req.url).searchParams.get("date");
    let runDate: Date | string = new Date();
    if (dateParam) {
        if (process.env.NODE_ENV === "production") {
            return NextResponse.json({ error: "DATE_OVERRIDE_DISABLED" }, { status: 400 });
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
            return NextResponse.json({ error: "INVALID_DATE" }, { status: 400 });
        }
        runDate = dateParam;
    }

    // try {
    //     const summary = await ReminderService.runDailyReminders(runDate);
    //     return NextResponse.json(summary);
    // } catch (err) {
    //     console.error("[Cron] Reminder run failed:", err instanceof Error ? err.message : err);
    //     return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
    // }

    let reminders: Awaited<ReturnType<typeof ReminderService.runDailyReminders>> | null = null;
    try {
        reminders = await ReminderService.runDailyReminders(runDate);
    } catch (err) {
        console.error("[Cron] Reminder run failed:", err instanceof Error ? err.message : err);
    }

    let risk: unknown;
    try {
        risk = await RiskService.runDailyEvaluation(runDate);
    } catch (err) {
        console.error("[Cron] Risk run failed:", err instanceof Error ? err.message : err);
        risk = { error: "RISK_RUN_FAILED" };
    }

    if (!reminders) {
        return NextResponse.json({ error: "INTERNAL_ERROR", risk }, { status: 500 });
    }
    return NextResponse.json({ ...reminders, risk });
}

export const GET = handle;
export const POST = handle;