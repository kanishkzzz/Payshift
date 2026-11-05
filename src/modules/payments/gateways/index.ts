import { PaymentGateway } from "../types";
import { MockGateway } from "./mock-gateway";
import { RazorpayGateway } from "./razorpay-gateway";

export * from "./mock-gateway";
export * from "./razorpay-gateway";

let gatewayInstance: PaymentGateway | null = null;

/**
 * Returns the configured payment gateway instance based on the PAYMENT_GATEWAY environment variable.
 * Defaults to MockGateway if PAYMENT_GATEWAY is unset or "mock".
 */
export function getPaymentGateway(): PaymentGateway {
  const driver = (process.env.PAYMENT_GATEWAY || "mock").toLowerCase().trim();

  if (driver === "razorpay") {
    return new RazorpayGateway();
  }

  // Default: MockGateway
  return new MockGateway();
}

/**
 * Overrides the active gateway instance (useful for unit tests).
 */
export function setTestPaymentGateway(mockGateway: PaymentGateway | null): void {
  gatewayInstance = mockGateway;
}

