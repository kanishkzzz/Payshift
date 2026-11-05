import { NextRequest, NextResponse } from "next/server";
import { PaymentService, PaymentError } from "@/modules/payments/services/payment-service";

export async function POST(req: NextRequest) {
  let rawBody = "";
  try {
    // 1. Read raw body as text. Do NOT parse before verifying signature.
    rawBody = await req.text();
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to read request body." },
      { status: 400 }
    );
  }

  // 2. Extract signature from supported gateway headers
  const signature =
    req.headers.get("x-razorpay-signature") ||
    req.headers.get("x-mock-signature") ||
    req.headers.get("x-webhook-signature") ||
    req.headers.get("signature") ||
    "";

  if (!signature) {
    return NextResponse.json(
      { error: "Missing webhook signature header." },
      { status: 400 }
    );
  }

  try {
    // 3. Process webhook (verifies signature first, executes single atomic transaction)
    const result = await PaymentService.processWebhook(rawBody, signature);

    // Return 200 only after commit
    return NextResponse.json({
      received: true,
      duplicate: result.duplicate,
      unmatched: result.unmatched,
      paymentId: result.paymentId,
      receiptNo: result.receiptNo,
      reason: result.reason,
    });
  } catch (err: unknown) {
    if (err instanceof PaymentError && err.statusCode === 400) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 400 }
      );
    }

    console.error("[WebhookRoute] Transaction failure or unexpected error:", (err as Error).message);
    // Return 500 on transaction failure so the payment gateway retries
    return NextResponse.json(
      { error: "Webhook processing error. Gateway should retry." },
      { status: 500 }
    );
  }
}

