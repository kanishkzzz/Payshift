import type { PaymentGateway } from "../types";
import { MockGateway } from "./mock-gateway";
import { RazorpayGateway } from "./razorpay-gateway";

export * from "./mock-gateway";
export * from "./razorpay-gateway";

let gatewayOverride: PaymentGateway | null = null;
let cached: { driver: string; instance: PaymentGateway } | null = null;

/** PAYMENT_GATEWAY = "mock" (default) | "razorpay". */
export function getPaymentGateway(): PaymentGateway {
  if (gatewayOverride) return gatewayOverride;

  const driver = (process.env.PAYMENT_GATEWAY || "mock").toLowerCase().trim();
  if (cached?.driver === driver) return cached.instance;

  let instance: PaymentGateway;
  if (driver === "razorpay") {
    instance = new RazorpayGateway();
  } else {
    if (driver !== "mock") {
      console.warn(`[Payments] Unknown PAYMENT_GATEWAY "${driver}", falling back to mock.`);
    }
    instance = new MockGateway();
  }

  cached = { driver, instance };
  return instance;
}

/** Overrides the active gateway (unit tests). Pass null to reset. */
export function setTestPaymentGateway(gateway: PaymentGateway | null): void {
  gatewayOverride = gateway;
  cached = null;
}