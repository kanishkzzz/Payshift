import crypto from "crypto";
import type { MessageChannel, OutboundMessage, SendResult } from "../types";

function maskPhone(phone: string): string {
    return phone.length <= 4 ? "****" : `${"*".repeat(phone.length - 4)}${phone.slice(-4)}`;
}

/**
 * Mock SMS/WhatsApp channel. Real delivery is out of scope for the core build.
 * Never logs message bodies or full phone numbers (DPDP: minimise PII in logs).
 */
export class MockMessageChannel implements MessageChannel {
    readonly name = "MOCK_WHATSAPP";
    readonly sent: OutboundMessage[] = [];

    async send(message: OutboundMessage): Promise<SendResult> {
        this.sent.push(message);
        if (process.env.NODE_ENV !== "production") {
            console.log(
                `[MockChannel] ${message.templateKey}/${message.lang} -> ${maskPhone(message.to)} (reminder ${message.reminderId})`
            );
        }
        return { ok: true, providerRef: `mock_${crypto.randomBytes(6).toString("hex")}` };
    }
}