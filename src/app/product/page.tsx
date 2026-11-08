import Link from "next/link";
import { ArrowRight, BarChart3, BookOpen, CreditCard, FileSpreadsheet, MessageSquareText, RefreshCw, Smartphone, UserRoundCheck } from "lucide-react";
import LandingExperience, { LandingActionButton } from "@/components/landing/LandingExperience";

const modules = [
  { id: "product-ledger", title: "Fee ledger", text: "Keep each student’s fee plan, instalments, payments, and remaining balance together.", icon: BookOpen },
  { id: "product-parent", title: "Parent payments", text: "Give guardians OTP access to linked student dues, payment checkout, and receipts.", icon: Smartphone },
  { id: "product-matching", title: "Payment matching", text: "Review incoming payments that need a student or instalment allocation.", icon: CreditCard },
  { id: "product-refunds", title: "Refund cases", text: "Calculate policy-based refunds and track review and settlement status.", icon: RefreshCw },
  { id: "product-reminders", title: "Fee reminders", text: "Schedule messages with each guardian’s English or Hindi preference.", icon: MessageSquareText },
  { id: "product-dues", title: "Dues reporting", text: "See overdue balances by ageing bucket, centre, batch, and student.", icon: BarChart3 },
  { id: "product-risk", title: "Counsellor tasks", text: "Turn payment and attendance signals into follow-up work for counsellors.", icon: UserRoundCheck },
  { id: "product-tally", title: "Accounting export", text: "Download receipt data as CSV for reconciliation and accounting workflows.", icon: FileSpreadsheet },
];

export default function ProductPage() {
  return <LandingExperience>
    <main className="min-h-screen bg-[#fafbff] text-slate-950">
      <section className="relative overflow-hidden border-b border-slate-200/70 bg-white">
        <div className="pointer-events-none absolute inset-0 opacity-70" style={{ background: "radial-gradient(ellipse at 76% 18%, rgba(120,137,255,.16), transparent 35%), radial-gradient(ellipse at 16% 68%, rgba(158,105,255,.10), transparent 32%)" }} />
        <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-16 sm:px-8 sm:pb-20 sm:pt-24">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-[#5470ff]">The Tracky platform</p>
          <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-.055em] sm:text-6xl">Fee operations, connected from the first reminder to the final receipt.</h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">Tracky brings fee records, parent payments, follow-ups, and reconciliation into one clear workflow for learning institutes.</p>
          <div className="mt-8 flex flex-wrap gap-3"><LandingActionButton action="demo" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-slate-800">Explore the demo <ArrowRight className="h-4 w-4" /></LandingActionButton><Link href="/#workflow" className="inline-flex min-h-12 items-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-800 hover:bg-slate-50">See how it works</Link></div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
        <div className="mb-8 max-w-2xl"><p className="text-xs font-bold uppercase tracking-[.14em] text-[#5470ff]">One workflow, eight connected parts</p><h2 className="mt-3 text-3xl font-semibold tracking-[-.045em] sm:text-4xl">Know what’s due, what’s paid, and what needs a person.</h2></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{modules.map(({ id, title, text, icon: Icon }) => <article id={id} key={id} className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_28px_rgba(30,45,90,.035)]"><span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-[#5470ff]"><Icon className="h-5 w-5" /></span><h3 className="mt-5 text-base font-semibold tracking-tight">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{text}</p></article>)}</div>
      </section>
      <section className="border-y border-slate-200 bg-white"><div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8"><div><p className="text-lg font-semibold tracking-tight">See the workflows with sample records.</p><p className="mt-1 text-sm text-slate-600">Explore parent, accounts, and counsellor access in the current demo.</p></div><LandingActionButton action="demo" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#5470ff] px-5 text-sm font-semibold text-white hover:bg-[#435fe8]">Try live demo <ArrowRight className="h-4 w-4" /></LandingActionButton></div></section>
      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-slate-500 sm:px-8"><Link href="/" className="font-semibold text-slate-800">Tracky home</Link><Link href="/for-parents" className="hover:text-[#5470ff]">For parents</Link><Link href="/login?tab=staff" className="hover:text-[#5470ff]">Staff login</Link></footer>
    </main>
  </LandingExperience>;
}
