/**
 * Bilingual (EN/HI) reminder templates. Pure, no I/O.
 * Tone rule: informative and polite at every stage, never threatening.
 */

import type { ReminderLang, ReminderTemplateKey, TemplateVars } from "./types";

const TEMPLATES: Record<ReminderTemplateKey, Record<ReminderLang, string>> = {
    BEFORE_DUE: {
        EN: "Dear {guardianName}, a gentle reminder: the fee of ₹{amount} for {studentName} is due on {dueDate}. Pay online: {payLink} - {instituteName}",
        HI: "प्रिय {guardianName}, {studentName} की ₹{amount} फीस {dueDate} को देय है। ऑनलाइन भुगतान करें: {payLink} - {instituteName}",
    },
    ON_DUE: {
        EN: "Dear {guardianName}, the fee of ₹{amount} for {studentName} is due today ({dueDate}). Pay here: {payLink}. Please ignore if already paid. - {instituteName}",
        HI: "प्रिय {guardianName}, {studentName} की ₹{amount} फीस आज ({dueDate}) देय है। भुगतान करें: {payLink}। यदि भुगतान हो चुका है तो कृपया इसे अनदेखा करें। - {instituteName}",
    },
    AFTER_DUE: {
        EN: "Dear {guardianName}, the fee of ₹{amount} for {studentName} was due on {dueDate} and is still pending. Please pay at {payLink}, or contact the office if you need help. - {instituteName}",
        HI: "प्रिय {guardianName}, {studentName} की ₹{amount} फीस {dueDate} को देय थी और अभी बाकी है। कृपया {payLink} पर भुगतान करें या सहायता के लिए कार्यालय से संपर्क करें। - {instituteName}",
    },
    ESCALATION: {
        EN: "Dear {guardianName}, ₹{amount} for {studentName} has been pending since {dueDate}. Please contact our accounts office to discuss a payment plan, or pay at {payLink}. - {instituteName}",
        HI: "प्रिय {guardianName}, {studentName} की ₹{amount} फीस {dueDate} से बाकी है। भुगतान योजना के लिए कृपया हमारे अकाउंट्स कार्यालय से संपर्क करें, या {payLink} पर भुगतान करें। - {instituteName}",
    },
};

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-15" -> EN "15 Nov 2026", HI "15/11/2026". */
export function formatDueDate(dateStr: string, lang: ReminderLang): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (!match) throw new Error(`Invalid date string: ${dateStr}`);
    const [, y, m, d] = match;
    if (lang === "HI") return `${d}/${m}/${y}`;
    return `${Number(d)} ${MONTHS_EN[Number(m) - 1]} ${y}`;
}

export function formatRupeeAmount(amountRupee: number): string {
    return amountRupee.toLocaleString("en-IN");
}

/** Renders a template. Throws if any placeholder has no value (never sends "{amount}" to a parent). */
export function renderTemplate(
    key: ReminderTemplateKey,
    lang: ReminderLang,
    vars: TemplateVars
): string {
    const template = TEMPLATES[key]?.[lang] ?? TEMPLATES[key]?.EN;
    if (!template) throw new Error(`No template for key "${key}"`);

    const values: Record<string, string> = {
        guardianName: vars.guardianName,
        studentName: vars.studentName,
        amount: formatRupeeAmount(vars.amountRupee),
        dueDate: formatDueDate(vars.dueDate, lang),
        payLink: vars.payLink,
        instituteName: vars.instituteName,
    };

    return template.replace(/\{(\w+)\}/g, (_, name: string) => {
        const value = values[name];
        if (value === undefined || value === "") {
            throw new Error(`Missing template variable "${name}" for ${key}/${lang}`);
        }
        return value;
    });
}

export function getTemplate(key: ReminderTemplateKey, lang: ReminderLang): string {
    return TEMPLATES[key][lang];
}