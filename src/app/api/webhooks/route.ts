import { NextResponse } from "next/server";
import { PaymentError, PaymentService } from "@/modules/payments/services/payment-service";



export async function POST(req: Request) {
    // Signature is computed over the exact raw bytes: never req.json() here.
    const rawBody = await req.text();

    try {
        const result = await PaymentService.processWebhook(rawBody, req.headers);
        return NextResponse.json({ ok: true, duplicate: Boolean(result.duplicate) }, { status: 200 });
    } catch (err) {
        if (err instanceof PaymentError && err.statusCode < 500) {
            return NextResponse.json({ error: err.code ?? "BAD_REQUEST" }, { status: err.statusCode });
        }
        // 5xx makes Razorpay retry; settlement is idempotent, so retries are safe.
        console.error("[Webhook] Processing failed:", err instanceof Error ? err.message : err);
        return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
    }
}