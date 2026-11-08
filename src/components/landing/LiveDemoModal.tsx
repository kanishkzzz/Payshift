"use client";

import Link from "next/link";
import { ArrowRight, Check, CircleUserRound, CreditCard, X } from "lucide-react";
import { useAccessibleDialog } from "@/components/landing/useAccessibleDialog";

interface LiveDemoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const areas = [
  "Sign-in flows and sample student dues",
  "Payment, allocation, and receipt APIs",
  "Refund review and unmatched transfer tools",
  "Reminder scheduling and counsellor tasks",
];

export default function LiveDemoModal({ isOpen, onClose }: LiveDemoModalProps) {
  const dialogRef = useAccessibleDialog<HTMLElement>(isOpen, onClose);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="demo-title" className="relative my-auto max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl outline-none sm:p-8">
        <button type="button" onClick={onClose} aria-label="Close demo options" className="absolute right-4 top-4 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-800"><X className="h-5 w-5" /></button>
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-[#5470ff]"><CircleUserRound className="h-5 w-5" /></span>
        <p className="mt-5 text-[10px] font-semibold uppercase tracking-[.16em] text-[#5470ff]">Tracky · current build</p>
        <h2 id="demo-title" className="mt-2 text-2xl font-bold tracking-[-.04em] text-slate-950">Explore the working flows</h2>
        <p className="mt-2 max-w-lg text-sm leading-6 text-slate-600">Explore parent, accounts, and counsellor workflows using the current development seed data, including payment and review actions.</p>

        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          {areas.map((area) => <div key={area} className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-700"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />{area}</div>)}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link href="/login?tab=parent" onClick={onClose} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"><CircleUserRound className="h-4 w-4 text-[#5470ff]" />Parent · phone OTP<ArrowRight className="h-4 w-4" /></Link>
          <Link href="/login?tab=staff" onClick={onClose} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"><CreditCard className="h-4 w-4" />Staff · email and password<ArrowRight className="h-4 w-4" /></Link>
        </div>
        <details className="mt-5 rounded-xl border border-slate-200 px-4 py-3 text-xs text-slate-600">
          <summary className="cursor-pointer font-semibold text-slate-800">Seeded sign-in details</summary>
          <div className="mt-3 space-y-2 leading-5">
            <p><strong>Staff:</strong> accounts@tracky.edu, counsellor@tracky.edu, or admin@tracky.edu · password <code className="rounded bg-slate-100 px-1.5 py-0.5">Staff@123</code>. These work after loading the development seed.</p>
            <p><strong>Parent:</strong> use <code className="rounded bg-slate-100 px-1.5 py-0.5">+91 9876543210</code>. In development, the login screen displays the generated OTP.</p>
          </div>
        </details>
        <p className="mt-4 text-xs leading-5 text-slate-500">Sample records are development seed data. Checkout behavior depends on the payment provider configured for this environment; refund cases track status and do not transfer money.</p>
      </section>
    </div>
  );
}
