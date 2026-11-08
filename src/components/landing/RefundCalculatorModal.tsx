"use client";

import React, { useState } from "react";
import { X, Calculator, CheckCircle2 } from "lucide-react";
import { useAccessibleDialog } from "@/components/landing/useAccessibleDialog";

interface RefundCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang?: "en" | "hi";
}

export default function RefundCalculatorModal({
  isOpen,
  onClose,
  lang = "en",
}: RefundCalculatorModalProps) {
  const dialogRef = useAccessibleDialog<HTMLDivElement>(isOpen, onClose);
  const [amountPaid, setAmountPaid] = useState<number>(50000);
  const [regFee, setRegFee] = useState<number>(5000);
  const [totalCourseDays, setTotalCourseDays] = useState<number>(180);
  const [attendedDays, setAttendedDays] = useState<number>(30);
  const [coolingOff, setCoolingOff] = useState<boolean>(false);

  if (!isOpen) return null;

  // Calculation
  const nonRefundable = regFee < amountPaid ? regFee : amountPaid;
  const base = Math.max(0, amountPaid - nonRefundable);
  const remainingDays = Math.max(0, totalCourseDays - attendedDays);

  let refundAmount = 0;
  let basis = "PRO_RATA";

  if (coolingOff) {
    refundAmount = base;
    basis = "COOLING_OFF";
  } else if (remainingDays === 0) {
    refundAmount = 0;
    basis = "COURSE_ENDED";
  } else {
    refundAmount = Math.floor((base * remainingDays) / totalCourseDays);
  }

  const isHindi = lang === "hi";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-sm animate-in fade-in duration-200" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="refund-title" className="relative my-auto max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 text-slate-800 shadow-2xl outline-none sm:p-8">
        {/* Top Glow & Header */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#5470ff] via-[#9a60f4] to-[#5470ff]"></div>

        <div className="flex items-center justify-between pb-4 border-b border-stone-200">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 text-[#5470ff] border border-indigo-100">
              <Calculator className="w-6 h-6" />
            </div>
            <div>
                <h3 id="refund-title" className="text-xl font-bold tracking-tight text-stone-950">
                {isHindi ? "ट्रैकी रिफंड कैलकुलेटर" : "Tracky Refund Calculator"}
              </h3>
              <p className="text-xs text-stone-500">
                {isHindi
                  ? "UGC और ट्रैकी पारदर्शी रिफंड नियम इंजन"
                  : "Illustrative estimate; the institute’s configured policy determines any final refund."}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close refund calculator"
            onClick={onClose}
            className="p-2 text-stone-500 hover:text-stone-950 rounded-lg hover:bg-stone-900/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-6">
          <div>
            <label htmlFor="refund-amount-paid" className="mb-1.5 block text-sm font-semibold text-slate-700">
              {isHindi ? "कुल भुगतान किया गया शुल्क (₹)" : "Total Fee Paid (₹)"}
            </label>
            <input
              id="refund-amount-paid"
              aria-label="Total fee paid in rupees"
              min={0}
              step={1}
              type="number"
              value={amountPaid}
              onChange={(e) => setAmountPaid(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-slate-950 transition-colors focus:border-[#5470ff] focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="refund-registration-fee" className="mb-1.5 block text-sm font-semibold text-slate-700">
              {isHindi ? "पंजीकरण शुल्क (Non-refundable) (₹)" : "Registration Fee (Non-refundable) (₹)"}
            </label>
            <input
              id="refund-registration-fee"
              aria-label="Registration fee in rupees"
              min={0}
              step={1}
              type="number"
              value={regFee}
              onChange={(e) => setRegFee(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-slate-950 transition-colors focus:border-[#5470ff] focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="refund-course-days" className="mb-1.5 block text-sm font-semibold text-slate-700">
              {isHindi ? "कुल पाठ्यक्रम दिवस" : "Total Course Duration (Days)"}
            </label>
            <input
              id="refund-course-days"
              aria-label="Total course duration in days"
              min={1}
              step={1}
              type="number"
              value={totalCourseDays}
              onChange={(e) => setTotalCourseDays(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-slate-950 transition-colors focus:border-[#5470ff] focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="refund-days-attended" className="mb-1.5 block text-sm font-semibold text-slate-700">
              {isHindi ? "छात्र द्वारा भाग लिए गए दिन" : "Days Attended / Elapsed"}
            </label>
            <input
              id="refund-days-attended"
              aria-label="Days attended or elapsed"
              min={0}
              max={totalCourseDays}
              step={1}
              type="number"
              value={attendedDays}
              onChange={(e) => setAttendedDays(Math.min(totalCourseDays, Math.max(0, Math.floor(Number(e.target.value) || 0))))}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-slate-950 transition-colors focus:border-[#5470ff] focus:outline-none"
            />
          </div>
        </div>

        {/* Toggle cooling off */}
        <div className="flex items-center gap-3 p-3 mb-6 rounded-lg bg-amber-50 border border-amber-800/20">
          <input
            type="checkbox"
            id="coolingOff"
            checked={coolingOff}
            onChange={(e) => setCoolingOff(e.target.checked)}
            className="w-4 h-4 rounded border-slate-700 text-blue-600 focus:ring-cyan-400"
          />
          <label htmlFor="coolingOff" className="text-xs text-stone-600 cursor-pointer">
            {isHindi
              ? "कूलिंग-ऑफ अवधि (7 दिनों के भीतर वापसी पर 100% रिफंडेबल बेस)"
              : "Assume this withdrawal qualifies for the institute’s cooling-off policy (full refundable base)"}
          </label>
        </div>

        {/* Calculation Result Box */}
        <div className="p-5 rounded-xl bg-[#f8f6f0] border border-emerald-900/20 glow-cyan">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-3 border-b border-stone-200">
            <div>
              <span className="text-xs text-emerald-800 font-semibold tracking-wider uppercase">
                {isHindi ? "गणना योग्य रिफंड राशि" : "Calculated Refund Payable"}
              </span>
              <div className="text-3xl font-extrabold text-stone-950 mt-1">
                ₹{refundAmount.toLocaleString("en-IN")}
              </div>
            </div>
            <span className="px-3 py-1 text-xs font-semibold rounded-full bg-emerald-900/8 text-emerald-800 border border-emerald-900/20">
              {basis === "COOLING_OFF"
                ? "Cooling-off (100%)"
                : basis === "COURSE_ENDED"
                ? "Course Ended (₹0)"
                : "Pro-Rata Formula"}
            </span>
          </div>

          <div className="mt-4 space-y-2 text-xs text-stone-600">
            <div className="flex items-center justify-between">
              <span>{isHindi ? "कुल प्राप्त राशि:" : "Total Amount Paid:"}</span>
              <span className="font-semibold text-stone-950">₹{amountPaid.toLocaleString("en-IN")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{isHindi ? "गैर-वापसी योग्य पंजीकरण शुल्क:" : "Non-refundable Registration:"}</span>
              <span className="font-semibold text-rose-400">- ₹{nonRefundable.toLocaleString("en-IN")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{isHindi ? "रिफंडेबल आधार मूल:" : "Refundable Base Amount:"}</span>
              <span className="font-semibold text-emerald-700">₹{base.toLocaleString("en-IN")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{isHindi ? "शेष पाठ्यक्रम दिन:" : "Remaining Course Days:"}</span>
              <span className="font-semibold text-stone-950">
                {remainingDays} / {totalCourseDays} days
              </span>
            </div>
          </div>
        </div>

        {/* Bottom actions */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-stone-200">
          <p className="text-[11px] text-stone-500 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            {isHindi
              ? "ट्रैकी ऑटोमेटेड रिफंड पाइपलाइन में सीधे एकीकृत"
              : "Estimate only · review the configured policy before making a decision"}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-2 rounded-lg bg-[#5470ff] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#405be3]"
          >
            {isHindi ? "बंद करें" : "Close Tool"}
          </button>
        </div>
      </div>
    </div>
  );
}
