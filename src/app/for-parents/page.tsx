import Link from "next/link";
import { ArrowRight, Check, Globe2, ReceiptText, Smartphone, WalletCards } from "lucide-react";
import LandingExperience from "@/components/landing/LandingExperience";

const steps = [
  { n: "01", title: "Sign in with your phone", text: "Use the phone number linked to your student’s account and verify with a one-time password.", icon: Smartphone },
  { n: "02", title: "Review fees due", text: "See the linked student’s fee plan, upcoming instalments, and outstanding balance in one place.", icon: WalletCards },
  { n: "03", title: "Pay and keep the receipt", text: "Complete checkout through the configured payment flow, then return to view payment history and receipts.", icon: ReceiptText },
];

export default function ForParentsPage() {
  return <LandingExperience>
    <main className="min-h-screen bg-[#fafbff] text-slate-950">
      <section className="relative overflow-hidden border-b border-slate-200/70 bg-white">
        <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse at 78% 12%, rgba(91,117,255,.14), transparent 34%), radial-gradient(ellipse at 14% 80%, rgba(137,82,233,.09), transparent 32%)" }} />
        <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-16 sm:px-8 sm:pb-20 sm:pt-24">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-[#5470ff]">For families</p>
          <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-.055em] sm:text-6xl">School fees and receipts, easier to find.</h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">A simple parent portal to check instalments, make a payment, and come back to your receipts when you need them.</p>
          <div className="mt-8 flex flex-wrap gap-3"><Link href="/login?tab=parent" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-slate-800">Parent login <ArrowRight className="h-4 w-4" /></Link><Link href="/" className="inline-flex min-h-12 items-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-800 hover:bg-slate-50">Explore Tracky</Link></div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
        <div className="grid gap-4 md:grid-cols-3">{steps.map(({ n, title, text, icon: Icon }) => <article key={n} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_8px_28px_rgba(30,45,90,.035)]"><div className="flex items-center justify-between"><span className="text-xs font-bold tracking-[.12em] text-[#5470ff]">{n}</span><span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-[#5470ff]"><Icon className="h-5 w-5" /></span></div><h2 className="mt-6 text-lg font-semibold tracking-tight">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{text}</p></article>)}</div>
        <div className="mt-6 grid gap-6 rounded-2xl border border-slate-200 bg-white p-6 sm:grid-cols-[1fr_auto] sm:items-center sm:p-8"><div><div className="flex items-center gap-2 text-sm font-semibold"><Globe2 className="h-4 w-4 text-[#5470ff]" />Fee reminders in your preferred language</div><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">English or Hindi applies to fee reminder messages sent to parents. It does not change the language of the website interface.</p></div><div className="flex items-center gap-2 text-xs font-semibold text-slate-600"><span className="rounded-lg bg-slate-100 px-3 py-2">English</span><span className="rounded-lg bg-slate-100 px-3 py-2">हिन्दी</span></div></div>
      </section>
      <section className="border-y border-slate-200 bg-white"><div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8"><div><p className="text-lg font-semibold tracking-tight">Need to check your student’s fees?</p><p className="mt-1 text-sm text-slate-600">Sign in with the phone number registered with your institute.</p></div><Link href="/login?tab=parent" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#5470ff] px-5 text-sm font-semibold text-white hover:bg-[#435fe8]">Go to parent login <ArrowRight className="h-4 w-4" /></Link></div></section>
      <footer className="mx-auto flex max-w-6xl flex-wrap items-center gap-5 px-5 py-8 text-sm text-slate-500 sm:px-8"><Link href="/" className="font-semibold text-slate-800">Tracky home</Link><Link href="/product" className="hover:text-[#5470ff]">Product overview</Link><span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5 text-emerald-600" />Your institute manages student account access</span></footer>
    </main>
  </LandingExperience>;
}
