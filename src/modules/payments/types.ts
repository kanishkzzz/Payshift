/**
 * Unified Payment Gateway Interface and Domain Types.
 */

export interface OrderCustomerDetails {
  name?: string;
  email?: string;
  phone?: string;
}

export interface CreateOrderOptions {
  orderRef: string;
  amountPaise: bigint | number;
  currency?: string; // Default: "INR"
  customer?: OrderCustomerDetails;
  notes?: Record<string, string>;
}

export interface CreateOrderResult {
  gatewayOrderId: string;
  checkoutUrl: string;
}

export interface NormalisedWebhookEvent {
  eventId: string;
  type: string;
  gatewayOrderId: string;
  gatewayPaymentId: string;
  amountPaise: bigint;
  status: "PAID" | "FAILED" | "OTHER";
}

export interface PaymentGateway {
  /**
   * Creates an order with the payment provider.
   */
  createOrder(options: CreateOrderOptions): Promise<CreateOrderResult>;

  /**
   * Verifies the authenticity of an incoming webhook payload using timing-safe signature comparison.
   * Must be called before parsing the body.
   */
  verifyWebhook(rawBody: string, signature: string): boolean;

  /**
   * Parses and normalises a verified webhook payload into a standardized event format.
   */
  parseWebhookEvent(rawBody: string): NormalisedWebhookEvent;
}

