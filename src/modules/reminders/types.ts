export const REMINDER_TEMPLATE_KEYS = ["BEFORE_DUE", "ON_DUE", "AFTER_DUE", "ESCALATION"] as const;
export type ReminderTemplateKey = (typeof REMINDER_TEMPLATE_KEYS)[number];

export type ReminderLang = "EN" | "HI";

export interface ReminderOffsetRule {
    templateKey: ReminderTemplateKey;
    /** Days relative to due date: -3 = 3 days before, 0 = on due date, 7 = 7 days after. */
    offsetDays: number;
}

export const DEFAULT_REMINDER_RULES: ReminderOffsetRule[] = [
    { templateKey: "BEFORE_DUE", offsetDays: -3 },
    { templateKey: "ON_DUE", offsetDays: 0 },
    { templateKey: "AFTER_DUE", offsetDays: 3 },
    { templateKey: "ESCALATION", offsetDays: 7 },
];

/** If a daily cron run is missed, a reminder may still be created this many days late. */
export const DEFAULT_CATCH_UP_DAYS = 1;

export interface ReminderCandidateInstalment {
    id: string;
    dueDate: Date | string;
    remainingPaise: bigint;
}

export interface PlannedReminder {
    instalmentId: string;
    templateKey: ReminderTemplateKey;
    /** Intended IST calendar date (YYYY-MM-DD) = dueDate + offsetDays. */
    scheduledFor: string;
}

export interface TemplateVars {
    guardianName: string;
    studentName: string;
    amountRupee: number;
    dueDate: string; // YYYY-MM-DD (IST)
    payLink: string;
    instituteName: string;
}

export interface OutboundMessage {
    reminderId: string;
    guardianId: string;
    to: string;
    body: string;
    lang: ReminderLang;
    templateKey: ReminderTemplateKey;
}

export interface SendResult {
    ok: boolean;
    providerRef?: string;
    error?: string;
}

export interface MessageChannel {
    readonly name: string;
    send(message: OutboundMessage): Promise<SendResult>;
}

export interface ReminderRunSummary {
    date: string;
    scheduled: number;
    sent: number;
    suppressedPaid: number;
    cancelled: number;
    failed: number;
    skipped: number;
}