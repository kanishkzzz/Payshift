"use client";

import { useState } from "react";
import { CreditCard, LoaderCircle } from "lucide-react";

interface RazorpayOptions {
  key: string; amount: number; currency: "INR"; name: string; description: string; order_id: string;
  prefill?: { name?: string; contact?: string; email?: string };
  handler: (result: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void;
  modal?: { ondismiss?: () => void };
}
declare global { interface Window { Razorpay?: new (options: RazorpayOptions) => { open: () => void } } }
type CheckoutPayload = { provider: "mock"; checkoutUrl: string } | { provider: "razorpay"; keyId: string; gatewayOrderId: string; amountPaise: string; currency: "INR"; prefill: { name?: string; contact?: string; email?: string } };

export default function InstalmentPaymentButton({ instalmentId }: { instalmentId: string }) {
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  async function loadRazorpay() {
    if (window.Razorpay) return;
    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-tracky-razorpay="true"]');
      if (existing) { existing.addEventListener("load", () => resolve(), { once: true }); existing.addEventListener("error", () => reject(new Error("Could not load secure checkout.")), { once: true }); return; }
      const script = document.createElement("script"); script.src = "https://checkout.razorpay.com/v1/checkout.js"; script.dataset.trackyRazorpay = "true"; script.onload = () => resolve(); script.onerror = () => reject(new Error("Could not load secure checkout.")); document.body.appendChild(script);
    });
  }
  async function start() {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/parent/instalments/${encodeURIComponent(instalmentId)}/pay`, { method: "POST" });
      const order = await response.json(); if (!response.ok) throw new Error(order.error ?? "Could not start checkout.");
      const checkout = order.checkout as CheckoutPayload | undefined;
      if (!checkout) throw new Error("Checkout details are missing from the payment response.");
      if (checkout.provider === "mock") { window.location.assign(checkout.checkoutUrl); return; }
      await loadRazorpay(); if (!window.Razorpay) throw new Error("Secure checkout did not finish loading.");
      const widget = new window.Razorpay({ key: checkout.keyId, amount: Number(checkout.amountPaise), currency: checkout.currency, name: "Tracky", description: "Instalment fee payment", order_id: checkout.gatewayOrderId, prefill: checkout.prefill, modal: { ondismiss: () => setBusy(false) }, handler: async (result) => {
        try { const verifyResponse = await fetch(`/api/parent/instalments/${encodeURIComponent(instalmentId)}/pay/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ razorpay_order_id: result.razorpay_order_id, razorpay_payment_id: result.razorpay_payment_id, razorpay_signature: result.razorpay_signature }) }); const verify = await verifyResponse.json(); if (!verifyResponse.ok) throw new Error(verify.error ?? "Payment confirmation failed."); setMessage(verify.status === "PAID" ? `Payment recorded${verify.receiptNo ? ` · receipt ${verify.receiptNo}` : ""}.` : verify.status === "UNDER_REVIEW" ? "Payment received and awaiting accounts review." : "Payment confirmation is pending. Your receipt will appear when the gateway confirms it."); window.setTimeout(() => window.location.reload(), 1600); }
        catch (cause) { setError(cause instanceof Error ? cause.message : "Payment could not be confirmed."); setBusy(false); }
      } }); widget.open();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start checkout."); setBusy(false); }
  }
  return <div className="mt-2"> <button type="button" onClick={() => void start()} disabled={busy} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-gradient-to-r from-[#5470ff] to-[#8f45f2] px-3 text-xs font-semibold text-white shadow-sm hover:shadow-md disabled:opacity-60">{busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}{busy ? "Opening checkout…" : "Pay remaining balance"}</button>{message && <p role="status" className="mt-2 max-w-xs text-xs leading-5 text-emerald-700">{message}</p>}{error && <p role="alert" className="mt-2 max-w-xs text-xs leading-5 text-rose-700">{error}</p>}</div>;
}
