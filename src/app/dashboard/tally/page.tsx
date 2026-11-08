"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Download, FileSpreadsheet, LoaderCircle, ShieldCheck } from "lucide-react";
import { PortalError, PortalLoading, PortalShell, useStaffAccess } from "@/components/portal/PortalShell";

export default function TallyExportPage() {
  const { user, loading, allowed } = useStaffAccess(["ACCOUNTS", "ADMIN"]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const frame = requestAnimationFrame(() => {
      setFrom(`${today.slice(0, 8)}01`);
      setTo(today);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  async function exportCsv(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      if (from > to) throw new Error("Start date must be on or before the end date.");
      const response = await fetch(`/api/staff/tally-exports?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Could not prepare the export.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `tally-receipts-${from}-to-${to}.csv`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
      setNotice("Export downloaded. It contains matched receipts for the selected dates and your permitted centre scope.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not prepare the export."); }
    finally { setBusy(false); }
  }

  if (loading || !allowed || !user) return <PortalLoading />;
  return <PortalShell user={user} title="Tally export" description="Download a date-filtered receipt export for your accounting handoff. The current backend produces a CSV file; live Tally synchronization is not enabled.">
    <div className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(20,30,60,.035)] sm:p-7"><span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-[#6558d9]"><FileSpreadsheet className="h-5 w-5" /></span><h2 className="mt-4 text-lg font-semibold">Receipt export</h2><p className="mt-1 text-sm leading-6 text-slate-500">Choose a date range of up to 366 days. The file includes recorded receipts, values in INR, and UTF-8 support for names and symbols.</p>
        <form onSubmit={exportCsv} className="mt-6 space-y-4"><div className="grid gap-4 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-600">From date<input type="date" required value={from} max={to} onChange={(event) => setFrom(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" /></label><label className="text-xs font-semibold text-slate-600">To date<input type="date" required value={to} min={from} onChange={(event) => setTo(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" /></label></div>
          {error && <PortalError message={error} />}{notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
          <button type="submit" disabled={busy} className="tracky-button-primary min-h-11 disabled:opacity-50">{busy ? <><LoaderCircle className="h-4 w-4 animate-spin" />Preparing export…</> : <><Download className="h-4 w-4" />Download CSV export</>}</button>
        </form>
      </section>
      <aside className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 via-white to-violet-50/80 p-5 sm:p-7"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-[#6558d9] shadow-sm"><ShieldCheck className="h-5 w-5" /></span><h2 className="mt-4 font-semibold">Scoped and auditable</h2><ul className="mt-3 space-y-3 text-sm leading-6 text-slate-600"><li>Centre-bound accounts staff can export only their own centre.</li><li>Administrators can export across centres.</li><li>The export includes matched receipts only; unmatched transfers are excluded.</li><li>This is an offline CSV handoff, not a live Tally connection.</li></ul></aside>
    </div>
  </PortalShell>;
}
