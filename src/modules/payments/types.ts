export type GatewayProvider = "mock" | "razorpay";

export interface CheckoutCustomer {
  name?: string;
  phone?: string;
  email?: string;
}

export interface CreateOrderOptions {
  orderRef: string;
  amountPaise: bigint | number;
  currency?: "INR";
  customer?: CheckoutCustomer;
  notes?: Record<string, string>;
}

/** What the browser needs to start a payment. Never contains secrets. */
export type CheckoutPayload =
  | { provider: "mock"; checkoutUrl: string }
  | {
    provider: "razorpay";
    keyId: string;
    gatewayOrderId: string;
    amountPaise: string;
    currency: "INR";
    prefill: { name?: string; contact?: string; email?: string };
  };

export interface CreateOrderResult {
  gatewayOrderId: string;
  checkout: CheckoutPayload;
}

export interface BuildCheckoutOptions {
  gatewayOrderId: string;
  orderRef: string;
  amountPaise: bigint;
  customer?: CheckoutCustomer;
}

export type NormalisedPaymentStatus = "PAID" | "FAILED" | "OTHER";

export interface NormalisedWebhookEvent {
  eventId: string;
  type: string;
  gatewayOrderId: string;
  gatewayPaymentId: string;
  amountPaise: bigint;
  status: NormalisedPaymentStatus;
  occurredAt?: Date;
  method?: string;
}

export interface FetchedGatewayPayment {
  gatewayPaymentId: string;
  gatewayOrderId: string;
  amountPaise: bigint;
  status: NormalisedPaymentStatus;
  rawStatus: string;
  occurredAt?: Date;
  method?: string;
}

export interface PaymentGateway {
  readonly provider: GatewayProvider;
  readonly signatureHeader: string;

  createOrder(options: CreateOrderOptions): Promise<CreateOrderResult>;
  buildCheckout(options: BuildCheckoutOptions): CheckoutPayload;

  verifyWebhook(rawBody: string, signature: string): boolean;
  parseWebhookEvent(rawBody: string, headers?: Headers): NormalisedWebhookEvent;

  verifyCheckoutSignature?(gatewayOrderId: string, gatewayPaymentId: string, signature: string): boolean;
  fetchPayment?(gatewayPaymentId: string): Promise<FetchedGatewayPayment>;
}