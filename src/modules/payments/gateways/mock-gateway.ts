import crypto from "crypto";
import {
  CreateOrderOptions,
  CreateOrderResult,
  NormalisedWebhookEvent,
  PaymentGateway,
} from "../types";

/**
 * Timing-safe string comparison to protect against timing attacks.
 */
export function timingSafeCompare(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export class MockGateway implements PaymentGateway {
  private secret: string;
  private baseUrl: string;

  constructor(secret?: string, baseUrl?: string) {
    this.secret =
      secret ||
      process.env.MOCK_PAYMENT_WEBHOOK_SECRET ||
      process.env.MOCK_GATEWAY_SECRET ||
      "mock_tracky_webhook_secret_key_2026";
    this.baseUrl =
      baseUrl || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  }

  /**
   * Generates a deterministic order ID and mock checkout URL.
   */
  async createOrder(options: CreateOrderOptions): Promise<CreateOrderResult> {
    const amountBig = BigInt(options.amountPaise);
    // Deterministic order ID derived from orderRef and amount
    const hash = crypto
      .createHash("sha256")
      .update(`${options.orderRef}:${amountBig.toString()}:${options.currency || "INR"}`)
      .digest("hex")
      .slice(0, 16);

    const gatewayOrderId = `order_mock_${hash}`;
    const checkoutUrl = `${this.baseUrl}/checkout/mock?orderId=${gatewayOrderId}&amount=${amountBig.toString()}&ref=${encodeURIComponent(options.orderRef)}`;

    return {
      gatewayOrderId,
      checkoutUrl,
    };
  }

  /**
   * Computes HMAC-SHA256 signature for a mock payload (useful in tests and mock dispatcher).
   */
  signPayload(rawBody: string): string {
    return crypto
      .createHmac("sha256", this.secret)
      .update(rawBody)
      .digest("hex");
  }

  /**
   * Timing-safe verification of webhook signature.
   */
  verifyWebhook(rawBody: string, signature: string): boolean {
    if (!signature || !rawBody) return false;
    const computedSignature = this.signPayload(rawBody);
    return timingSafeCompare(computedSignature, signature);
  }

  /**
   * Parses and normalises a verified mock webhook event.
   */
  parseWebhookEvent(rawBody: string): NormalisedWebhookEvent {
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw new Error("Invalid JSON in mock webhook payload");
    }

    const eventId = String(payload.eventId || payload.id || `evt_mock_${Date.now()}`);
    const type = String(payload.type || payload.event || "payment.captured");
    const gatewayOrderId = String(payload.gatewayOrderId || payload.orderId || "");
    const gatewayPaymentId = String(
      payload.gatewayPaymentId || payload.paymentId || `pay_mock_${Date.now()}`
    );
    const amountPaise = BigInt(payload.amountPaise ?? payload.amount ?? 0);

    let status: "PAID" | "FAILED" | "OTHER" = "PAID";
    if (payload.status === "FAILED" || type.includes("failed")) {
      status = "FAILED";
    } else if (payload.status === "PAID" || type.includes("captured") || type.includes("paid")) {
      status = "PAID";
    } else {
      status = payload.status || "OTHER";
    }

    return {
      eventId,
      type,
      gatewayOrderId,
      gatewayPaymentId,
      amountPaise,
      status,
    };
  }
}

