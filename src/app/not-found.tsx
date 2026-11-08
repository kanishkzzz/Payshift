import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import LandingExperience, { LandingActionButton } from "@/components/landing/LandingExperience";

export default function NotFound() {
  return <LandingExperience>
    <main className="grid min-h-[calc(100vh-68px)] place-items-center bg-[#fafbff] px-5 py-16 text-center text-slate-950">
      <div className="max-w-xl">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-[#5470ff]">404 · Page not found</p>
        <h1 className="mt-5 text-4xl font-semibold tracking-[-.055em] sm:text-5xl">Let’s get you back on track.</h1>
        <p className="mx-auto mt-5 max-w-md text-base leading-7 text-slate-600">That address doesn’t lead to a Tracky page. Start from the product overview or open the live demo.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3"><Link href="/" className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-800 hover:bg-slate-50"><ArrowLeft className="h-4 w-4" />Home</Link><Link href="/product" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-slate-800">Product overview <ArrowRight className="h-4 w-4" /></Link><LandingActionButton action="demo" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#5470ff] px-5 text-sm font-semibold text-white hover:bg-[#435fe8]">Try live demo <ArrowRight className="h-4 w-4" /></LandingActionButton></div>
      </div>
    </main>
  </LandingExperience>;
}
