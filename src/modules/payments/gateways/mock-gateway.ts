import crypto from "crypto";
import type {
  BuildCheckoutOptions,
  CheckoutPayload,
  CreateOrderOptions,
  CreateOrderResult,
  NormalisedPaymentStatus,
  NormalisedWebhookEvent,
  PaymentGateway,
} from "../types";

const DEV_FALLBACK_SECRET = "mock_tracky_webhook_secret_key_2026";

/** Timing-safe string comparison to protect against timing attacks. */
export function timingSafeCompare(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export class MockGateway implements PaymentGateway {
  readonly provider = "mock" as const;
  readonly signatureHeader = "x-mock-signature";

  private secret: string;
  private baseUrl: string;

  constructor(secret?: string, baseUrl?: string) {
    const envSecret = process.env.MOCK_PAYMENT_WEBHOOK_SECRET || process.env.MOCK_GATEWAY_SECRET;

    // A publicly known secret in production means anyone can forge a "payment".
    if (process.env.NODE_ENV === "production" && !secret && !envSecret) {
      throw new Error(
        "MockGateway in production requires MOCK_PAYMENT_WEBHOOK_SECRET. Set PAYMENT_GATEWAY=razorpay for real payments."
      );
    }

    this.secret = secret || envSecret || DEV_FALLBACK_SECRET;
    this.baseUrl = baseUrl || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  }

  async createOrder(options: CreateOrderOptions): Promise<CreateOrderResult> {
    const amountPaise = BigInt(options.amountPaise);
    const hash = crypto
      .createHash("sha256")
      .update(`${options.orderRef}:${amountPaise.toString()}:${options.currency || "INR"}`)
      .digest("hex")
      .slice(0, 16);

    const gatewayOrderId = `order_mock_${hash}`;
    return {
      gatewayOrderId,
      checkout: this.buildCheckout({
        gatewayOrderId,
        orderRef: options.orderRef,
        amountPaise,
        customer: options.customer,
      }),
    };
  }

  buildCheckout(options: BuildCheckoutOptions): CheckoutPayload {
    const url =
      `${this.baseUrl}/checkout/mock?orderId=${options.gatewayOrderId}` +
      `&amount=${options.amountPaise.toString()}&ref=${encodeURIComponent(options.orderRef)}`;
    return { provider: "mock", checkoutUrl: url };
  }

  signPayload(rawBody: string): string {
    return crypto.createHmac("sha256", this.secret).update(rawBody).digest("hex");
  }

  verifyWebhook(rawBody: string, signature: string): boolean {
    if (!signature || !rawBody) return false;
    return timingSafeCompare(this.signPayload(rawBody), signature);
  }

  parseWebhookEvent(rawBody: string, headers?: Headers): NormalisedWebhookEvent {
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw new Error("Invalid JSON in mock webhook payload");
    }

    const type = String(payload.type || payload.event || "payment.captured");
    const gatewayPaymentId = String(payload.gatewayPaymentId || payload.paymentId || `pay_mock_${Date.now()}`);
    const eventId = String(
      headers?.get("x-mock-event-id") || payload.eventId || payload.id || `evt_mock_${gatewayPaymentId}`
    );

    let status: NormalisedPaymentStatus = "OTHER";
    if (payload.status === "FAILED" || type.includes("failed")) status = "FAILED";
    else if (payload.status === "PAID" || type.includes("captured") || type.includes("paid")) status = "PAID";

    return {
      eventId,
      type,
      gatewayOrderId: String(payload.gatewayOrderId || payload.orderId || ""),
      gatewayPaymentId,
      amountPaise: BigInt(payload.amountPaise ?? payload.amount ?? 0),
      status,
      occurredAt: new Date(),
    };
  }
}