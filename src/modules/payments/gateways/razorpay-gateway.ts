import crypto from "crypto";
import Razorpay from "razorpay";
import { timingSafeCompare } from "./mock-gateway";
import type {
  BuildCheckoutOptions,
  CheckoutPayload,
  CreateOrderOptions,
  CreateOrderResult,
  FetchedGatewayPayment,
  NormalisedPaymentStatus,
  NormalisedWebhookEvent,
  PaymentGateway,
} from "../types";

export class GatewayConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GatewayConfigError";
  }
}

const MIN_ORDER_PAISE = BigInt(100); // ₹1

function mapPaymentStatus(rawStatus: string): NormalisedPaymentStatus {
  if (rawStatus === "captured") return "PAID";
  if (rawStatus === "failed") return "FAILED";
  return "OTHER";
}

/** Only money-in events count as PAID. payment.authorized is NOT paid. */
function mapEventStatus(event: string): NormalisedPaymentStatus {
  if (event === "payment.captured" || event === "order.paid") return "PAID";
  if (event === "payment.failed") return "FAILED";
  return "OTHER";
}

function unixToDate(value: unknown): Date | undefined {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value * 1000) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function amountToBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  return BigInt(0);
}

function describeRazorpayError(err: unknown): string {
  const e = err as { error?: { description?: string }; message?: string };
  return e?.error?.description ?? e?.message ?? "unknown error";
}

export class RazorpayGateway implements PaymentGateway {
  readonly provider = "razorpay" as const;
  readonly signatureHeader = "x-razorpay-signature";

  private readonly keyId: string;
  private readonly keySecret: string;
  private readonly webhookSecret: string;
  private client: Razorpay | null = null;

  constructor(config?: { keyId?: string; keySecret?: string; webhookSecret?: string }) {
    this.keyId = config?.keyId ?? process.env.RAZORPAY_KEY_ID ?? "";
    this.keySecret = config?.keySecret ?? process.env.RAZORPAY_KEY_SECRET ?? "";
    this.webhookSecret = config?.webhookSecret ?? process.env.RAZORPAY_WEBHOOK_SECRET ?? "";
  }

  private getClient(): Razorpay {
    if (!this.keyId || !this.keySecret) {
      throw new GatewayConfigError("Razorpay is not configured: set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
    }
    if (!this.client) {
      this.client = new Razorpay({ key_id: this.keyId, key_secret: this.keySecret });
    }
    return this.client;
  }

  async createOrder(options: CreateOrderOptions): Promise<CreateOrderResult> {
    const amountPaise = BigInt(options.amountPaise);
    if (amountPaise < MIN_ORDER_PAISE) throw new Error("Razorpay orders must be at least ₹1 (100 paise).");
    if (amountPaise > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Order amount exceeds the safe integer range.");

    const client = this.getClient();
    let order: { id: string; amount: number | string };
    try {
      order = await client.orders.create({
        amount: Number(amountPaise),
        currency: options.currency ?? "INR",
        receipt: options.orderRef.slice(0, 40),
        notes: options.notes ?? {},
      });
    } catch (err) {
      throw new Error(`Razorpay order creation failed: ${describeRazorpayError(err)}`);
    }

    if (!order?.id) throw new Error("Razorpay did not return an order id.");
    if (BigInt(order.amount) !== amountPaise) {
      throw new Error(`Razorpay order amount mismatch: requested ${amountPaise}, got ${order.amount}.`);
    }

    return {
      gatewayOrderId: order.id,
      checkout: this.buildCheckout({
        gatewayOrderId: order.id,
        orderRef: options.orderRef,
        amountPaise,
        customer: options.customer,
      }),
    };
  }

  buildCheckout(options: BuildCheckoutOptions): CheckoutPayload {
    if (!this.keyId) throw new GatewayConfigError("Razorpay is not configured: set RAZORPAY_KEY_ID.");
    return {
      provider: "razorpay",
      keyId: this.keyId,
      gatewayOrderId: options.gatewayOrderId,
      amountPaise: options.amountPaise.toString(),
      currency: "INR",
      prefill: {
        name: options.customer?.name,
        contact: options.customer?.phone,
        email: options.customer?.email,
      },
    };
  }

  verifyWebhook(rawBody: string, signature: string): boolean {
    if (!rawBody || !signature || !this.webhookSecret) return false;
    const expected = crypto.createHmac("sha256", this.webhookSecret).update(rawBody).digest("hex");
    return timingSafeCompare(expected, signature);
  }

  verifyCheckoutSignature(gatewayOrderId: string, gatewayPaymentId: string, signature: string): boolean {
    if (!gatewayOrderId || !gatewayPaymentId || !signature || !this.keySecret) return false;
    const expected = crypto
      .createHmac("sha256", this.keySecret)
      .update(`${gatewayOrderId}|${gatewayPaymentId}`)
      .digest("hex");
    return timingSafeCompare(expected, signature);
  }

  parseWebhookEvent(rawBody: string, headers?: Headers): NormalisedWebhookEvent {
    let payload: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(rawBody);
      if (!isRecord(parsed)) throw new Error("Expected an object payload");
      payload = parsed;
    } catch {
      throw new Error("Invalid JSON in Razorpay webhook payload");
    }

    const event = String(payload?.event ?? "");
    const eventPayload = recordOrEmpty(payload.payload);
    const paymentEnvelope = recordOrEmpty(eventPayload.payment);
    const orderEnvelope = recordOrEmpty(eventPayload.order);
    const payment = recordOrEmpty(paymentEnvelope.entity);
    const order = recordOrEmpty(orderEnvelope.entity);

    const gatewayPaymentId = String(payment.id ?? "");
    const gatewayOrderId = String(payment.order_id ?? order.id ?? "");

    const headerEventId = headers?.get("x-razorpay-event-id")?.trim();
    const eventId = headerEventId || `${event}:${gatewayPaymentId || gatewayOrderId}:${payload?.created_at ?? ""}`;

    const rawAmount = payment.amount ?? order.amount_paid ?? order.amount;

    return {
      eventId,
      type: event,
      gatewayOrderId,
      gatewayPaymentId,
      amountPaise: amountToBigInt(rawAmount),
      status: mapEventStatus(event),
      occurredAt: unixToDate(payment.created_at) ?? unixToDate(payload?.created_at),
      method: typeof payment.method === "string" ? payment.method : undefined,
    };
  }

  async fetchPayment(gatewayPaymentId: string): Promise<FetchedGatewayPayment> {
    const client = this.getClient();
    let p: {
      id?: string;
      order_id?: string | null;
      amount?: number | string;
      status?: string;
      created_at?: number;
      method?: string;
    };
    try {
      p = await client.payments.fetch(gatewayPaymentId);
    } catch (err) {
      throw new Error(`Razorpay payment fetch failed: ${describeRazorpayError(err)}`);
    }
    const rawStatus = String(p?.status ?? "");
    return {
      gatewayPaymentId: String(p?.id ?? gatewayPaymentId),
      gatewayOrderId: String(p?.order_id ?? ""),
      amountPaise: BigInt(p?.amount ?? 0),
      status: mapPaymentStatus(rawStatus),
      rawStatus,
      occurredAt: unixToDate(p?.created_at),
      method: typeof p?.method === "string" ? p.method : undefined,
    };
  }
}
