import crypto from "crypto";
import {
  CreateOrderOptions,
  CreateOrderResult,
  NormalisedWebhookEvent,
  PaymentGateway,
} from "../types";
import { timingSafeCompare } from "./mock-gateway";

export class RazorpayGateway implements PaymentGateway {
  private keyId: string;
  private keySecret: string;
  private webhookSecret: string;

  constructor() {
    this.keyId = process.env.RAZORPAY_KEY_ID || "";
    this.keySecret = process.env.RAZORPAY_KEY_SECRET || "";
    this.webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || "";
  }

  /**
   * Creates an order via Razorpay Orders API (or simulated in test mode if credentials are unconfigured).
   */
  async createOrder(options: CreateOrderOptions): Promise<CreateOrderResult> {
    const amountPaise = Number(options.amountPaise);

    // If live credentials are provided, invoke Razorpay REST API
    if (this.keyId && this.keySecret) {
      const basicAuth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64");
      const res = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: amountPaise,
          currency: options.currency || "INR",
          receipt: options.orderRef,
          notes: options.notes,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Razorpay API order creation failed: ${res.status} ${errorText}`);
      }

      const orderData = (await res.json()) as { id: string };
      return {
        gatewayOrderId: orderData.id,
        checkoutUrl: `https://checkout.razorpay.com/v1/checkout.html?order_id=${orderData.id}`,
      };
    }

    // Test mode fallback when running tests without live network calls
    const testHash = crypto
      .createHash("sha256")
      .update(`${options.orderRef}:${amountPaise}`)
      .digest("hex")
      .slice(0, 14);

    const gatewayOrderId = `order_${testHash}`;
    return {
      gatewayOrderId,
      checkoutUrl: `https://checkout.razorpay.com/v1/checkout.html?order_id=${gatewayOrderId}`,
    };
  }

  /**
   * Verifies incoming webhook signature using timing-safe comparison.
   * Compares the computed HMAC-SHA256 signature against the x-razorpay-signature header.
   */
  verifyWebhook(rawBody: string, signature: string): boolean {
    if (!signature || !rawBody) return false;
    if (!this.webhookSecret) return false;

    const computedSignature = crypto
      .createHmac("sha256", this.webhookSecret)
      .update(rawBody)
      .digest("hex");

    return timingSafeCompare(computedSignature, signature);
  }

  /**
   * Normalises Razorpay webhook event payload.
   */
  parseWebhookEvent(rawBody: string): NormalisedWebhookEvent {
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw new Error("Invalid JSON in Razorpay webhook payload");
    }

    const event = String(payload.event || "");
    const paymentEntity = payload.payload?.payment?.entity;
    const orderEntity = payload.payload?.order?.entity;

    const eventId = String(payload.id || payload.event_id || `evt_${paymentEntity?.id || Date.now()}`);
    const gatewayOrderId = String(paymentEntity?.order_id || orderEntity?.id || "");
    const gatewayPaymentId = String(paymentEntity?.id || "");
    const amountPaise = BigInt(paymentEntity?.amount ?? orderEntity?.amount ?? 0);

    let status: "PAID" | "FAILED" | "OTHER" = "PAID";
    if (event === "payment.captured" || event === "order.paid") {
      status = "PAID";
    } else if (event.includes("failed")) {
      status = "FAILED";
    } else {
      status = "OTHER";
    }

    return {
      eventId,
      type: event,
      gatewayOrderId,
      gatewayPaymentId,
      amountPaise,
      status,
    };
  }
}

