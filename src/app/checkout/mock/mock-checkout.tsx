"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle, ShieldCheck } from "lucide-react";
import TrackyBrandIcon from "@/components/TrackyBrandIcon";

const money = (paise: string) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(paise) / 100);

export default function MockCheckout({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"LOADING" | "READY" | "WORKING" | "PAID" | "REVIEW" | "ERROR">("LOADING");
  const [amountPaise, setAmountPaise] = useState("0");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`/api/parent/checkout/mock?orderId=${encodeURIComponent(orderId)}`, { cache: "no-store" })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Could not verify this checkout."); if (!active) return; setAmountPaise(result.amountPaise); setStatus(result.status === "PAID" ? "PAID" : result.status === "FAILED" ? "ERROR" : "READY"); if (result.status === "FAILED") setError("This payment order has failed. Return to your fee overview to try again."); })
      .catch((cause: unknown) => { if (active) { setError(cause instanceof Error ? cause.message : "Could not verify this checkout."); setStatus("ERROR"); } });
    return () => { active = false; };
  }, [orderId]);

  async function confirm() {
    setStatus("WORKING"); setError("");
    try {
      const response = await fetch("/api/parent/checkout/mock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Payment could not be completed.");
      setStatus(result.status === "UNDER_REVIEW" ? "REVIEW" : result.status === "FAILED" ? "ERROR" : "PAID");
      if (result.status === "FAILED") setError("This payment could not be completed. Return to your fee overview to try again.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Payment could not be completed."); setStatus("ERROR");
    }
  }

  return <main className="tracky-workspace grid min-h-screen place-items-center px-4 py-12">
    <section className="tracky-auth-card w-full max-w-md border border-white bg-white p-7 sm:p-9">
      <Link href="/parent/dues" className="mb-8 inline-flex items-center gap-2 font-semibold tracking-tight text-slate-900"><TrackyBrandIcon className="h-9 w-9 rounded-xl" />Tracky</Link>
      {status === "PAID" || status === "REVIEW" ? <div className="py-5 text-center"><CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" /><h1 className="mt-4 text-2xl font-semibold">{status === "PAID" ? "Payment recorded" : "Payment received"}</h1><p className="mt-2 text-sm leading-6 text-slate-600">{status === "PAID" ? "Your demo payment has been added to the fee ledger." : "The payment needs a quick review before it appears in your fee records."}</p><Link href="/parent/dues" className="tracky-button-primary mt-6">Return to fee overview</Link></div> : <>
        <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-[#6558d9]"><ShieldCheck className="h-3.5 w-3.5" />Demo checkout</span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">Confirm fee payment</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">This is a development payment flow. It records a simulated payment and does not charge a card or bank account.</p>
        <div className="my-6 rounded-2xl border border-slate-200 bg-slate-50 p-5"><p className="text-xs text-slate-500">Amount due</p><p className="mt-1 text-3xl font-semibold tracking-tight">{money(amountPaise)}</p></div>
        {error && <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <button type="button" disabled={(status !== "READY" && status !== "ERROR") || !orderId} onClick={status === "ERROR" ? () => router.push("/parent/dues") : confirm} className="tracky-button-primary w-full justify-center disabled:opacity-60">{status === "LOADING" || status === "WORKING" ? <><LoaderCircle className="h-4 w-4 animate-spin" />{status === "LOADING" ? "Checking payment order…" : "Recording demo payment…"}</> : status === "ERROR" ? "Return to fee overview" : "Complete demo payment"}</button>
        <Link href="/parent/dues" className="mt-4 block text-center text-sm font-medium text-slate-500 hover:text-slate-900">Cancel and return</Link>
      </>}
    </section>
  </main>;
}
