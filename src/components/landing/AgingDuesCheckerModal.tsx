"use client";

import React, { useState } from "react";
import { X, Clock, PieChart, ShieldAlert } from "lucide-react";
import { useAccessibleDialog } from "@/components/landing/useAccessibleDialog";

interface AgingDuesCheckerModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang?: "en" | "hi";
}

export default function AgingDuesCheckerModal({
  isOpen,
  onClose,
  lang = "en",
}: AgingDuesCheckerModalProps) {
  const dialogRef = useAccessibleDialog<HTMLDivElement>(isOpen, onClose);
  const [b1, setB1] = useState<number>(145000); // 0-30 days
  const [b2, setB2] = useState<number>(82000);  // 31-60 days
  const [b3, setB3] = useState<number>(53000);  // 60+ days

  if (!isOpen) return null;

  const total = b1 + b2 + b3;
  const p1 = total > 0 ? Math.round((b1 / total) * 100) : 0;
  const p2 = total > 0 ? Math.round((b2 / total) * 100) : 0;
  const p3 = total > 0 ? Math.round((b3 / total) * 100) : 0;

  const isHindi = lang === "hi";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-sm animate-in fade-in duration-200" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="aging-title" className="relative my-auto max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 text-slate-800 shadow-2xl outline-none sm:p-8">
        {/* Top Glow & Header */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#5470ff] via-[#9a60f4] to-[#5470ff]"></div>

        <div className="flex items-center justify-between pb-4 border-b border-stone-200">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 text-[#5470ff] border border-indigo-100">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <h3 id="aging-title" className="text-xl font-bold tracking-tight text-stone-950">
                {isHindi ? "एजिंग बकाया विश्लेषण टूल" : "Aging Dues Checker"}
              </h3>
              <p className="text-xs text-stone-500">
                {isHindi
                  ? "0-30, 31-60, और 60+ दिनों के बकाये का त्वरित ब्रेकडाउन"
                  : "Enter your own totals to preview the distribution. Nothing is uploaded."}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close ageing dues checker"
            onClick={onClose}
            className="p-2 text-stone-500 hover:text-stone-950 rounded-lg hover:bg-stone-900/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Inputs */}
        <p className="mt-4 text-xs leading-5 text-slate-500">Example figures are prefilled. Replace them with your own amounts to explore the buckets.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 my-4">
          <div>
            <label htmlFor="aging-bucket-0-30" className="mb-1.5 block text-sm font-semibold text-emerald-800">
              0–30 {isHindi ? "दिन बकाया (₹)" : "Days Dues (₹)"}
            </label>
            <input
              id="aging-bucket-0-30"
              aria-label="Amount in the 0 to 30 day bucket, rupees"
              min={0}
              step={1}
              type="number"
              value={b1}
              onChange={(e) => setB1(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-slate-950 transition-colors focus:border-[#5470ff] focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="aging-bucket-31-60" className="mb-1.5 block text-sm font-semibold text-amber-800">
              31–60 {isHindi ? "दिन बकाया (₹)" : "Days Dues (₹)"}
            </label>
            <input
              id="aging-bucket-31-60"
              aria-label="Amount in the 31 to 60 day bucket, rupees"
              min={0}
              step={1}
              type="number"
              value={b2}
              onChange={(e) => setB2(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-slate-950 transition-colors focus:border-[#5470ff] focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="aging-bucket-60-plus" className="mb-1.5 block text-sm font-semibold text-rose-800">
              60+ {isHindi ? "दिन बकाया (₹)" : "Days Dues (₹)"}
            </label>
            <input
              id="aging-bucket-60-plus"
              aria-label="Amount in the 60 plus day bucket, rupees"
              min={0}
              step={1}
              type="number"
              value={b3}
              onChange={(e) => setB3(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-slate-950 transition-colors focus:border-[#5470ff] focus:outline-none"
            />
          </div>
        </div>

        {/* Visual Aging Bar */}
        <div className="my-6">
          <div className="flex justify-between items-center text-xs mb-2">
            <span className="text-stone-600 font-semibold flex items-center gap-1.5">
              <PieChart className="w-4 h-4 text-emerald-800" />
              {isHindi ? "कुल बकाया पोर्टफोलियो:" : "Total Dues Portfolio:"} ₹{total.toLocaleString("en-IN")}
            </span>
            <span className="text-stone-500">Amount by aging bucket</span>
          </div>
          <div className="h-4 w-full rounded-full bg-[#f8f6f0] overflow-hidden flex border border-stone-200 p-0.5">
            <div
              style={{ width: `${p1}%` }}
              className="h-full bg-emerald-500 transition-all duration-300 rounded-l-full"
              title={`0-30 Days: ₹${b1}`}
            ></div>
            <div
              style={{ width: `${p2}%` }}
              className="h-full bg-amber-500 transition-all duration-300"
              title={`31-60 Days: ₹${b2}`}
            ></div>
            <div
              style={{ width: `${p3}%` }}
              className="h-full bg-rose-500 transition-all duration-300 rounded-r-full"
              title={`60+ Days: ₹${b3}`}
            ></div>
          </div>
        </div>

        {/* Cards Breakdown */}
        <div className="grid grid-cols-3 gap-3 my-4 text-center">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <div className="text-xs font-bold uppercase text-emerald-800">0–30 Days</div>
            <div className="mt-1 text-lg font-bold text-slate-950">₹{b1.toLocaleString("en-IN")}</div>
            <div className="text-xs font-medium text-emerald-800">{p1}% of total</div>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <div className="text-xs font-bold uppercase text-amber-800">31–60 Days</div>
            <div className="mt-1 text-lg font-bold text-slate-950">₹{b2.toLocaleString("en-IN")}</div>
            <div className="text-xs font-medium text-amber-800">{p2}% of total</div>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
            <div className="text-xs font-bold uppercase text-rose-800">60+ Days</div>
            <div className="mt-1 text-lg font-bold text-slate-950">₹{b3.toLocaleString("en-IN")}</div>
            <div className="text-xs font-medium text-rose-800">{p3}% of total</div>
          </div>
        </div>

        {/* High Risk Alert Notice if b3 > 20% */}
        {p3 > 20 && (
          <div role="status" className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-900">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" />
            <div>
              <span className="font-semibold text-rose-900">
                {isHindi ? "ध्यान दें:" : "Ageing note:"}
              </span>{" "}
              {isHindi
                ? `आपका ${p3}% बकाया 60+ दिनों से पुराना है। ट्रैकी का ऑटोमेटेड व्हाट्सएप रिमाइंडर्स और काउंसलर वर्कलिस्ट इंजन इस श्रेणी को प्राथमिकता देकर रिकवरी बढ़ाता है।`
                : `${p3}% of the amounts you entered are in the 60+ day bucket. This is an input breakdown only; it does not trigger alerts or outreach.`}
            </div>
          </div>
        )}

        {/* Action Button */}
        <div className="flex items-center justify-end mt-6 pt-4 border-t border-stone-200">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-[#5470ff] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#405be3]"
          >
            {isHindi ? "बंद करें" : "Close Tool"}
          </button>
        </div>
      </div>
    </div>
  );
}
