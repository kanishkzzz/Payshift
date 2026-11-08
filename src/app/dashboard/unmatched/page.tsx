"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, RefreshCw, X } from "lucide-react";
import { PortalError, PortalLoading, PortalShell, useStaffAccess } from "@/components/portal/PortalShell";

interface PaymentRow { id: string; amountRupee: number; source: string; gatewayRef: string | null; receivedAt: string; notes: string | null; student: { id: string; name: string; batch: { id: string; name: string } } | null }
const money = (rupees: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(rupees);

export default function UnmatchedPaymentsPage() {
  const { user, loading: sessionLoading, allowed } = useStaffAccess(["ACCOUNTS", "ADMIN"]);
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");
  const [studentIds, setStudentIds] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/staff/unmatched-payments", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not load unmatched payments.");
      setRows(payload.payments as PaymentRow[]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load unmatched payments."); }
    finally { setLoading(false); }
  }, []);

  // The state updates are applied after load's network request settles.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (allowed) void load(); }, [allowed, load]);
  const refresh = () => { setLoading(true); setError(""); void load(); };

  async function resolve(row: PaymentRow, action: "match" | "reject") {
    setBusyId(row.id); setError(""); setNotice("");
    try {
      const studentId = studentIds[row.id]?.trim();
      if (action === "match" && !studentId) throw new Error("Enter the student ID to match this payment.");
      const response = await fetch(`/api/staff/unmatched-payments/${encodeURIComponent(row.id)}/${action}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "match" ? { studentId } : { reason: reasons[row.id]?.trim() || undefined }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? `Could not ${action} payment.`);
      setNotice(action === "match" ? `Matched successfully. Receipt ${payload.receiptNo} was issued.` : "Payment marked as rejected and retained in the audit trail.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update this payment."); }
    finally { setBusyId(""); }
  }

  if (sessionLoading || !allowed || !user) return <PortalLoading />;
  return <PortalShell user={user} title="Unmatched payments" description="Resolve transfers that arrived without a reliable student reference. Matching allocates funds and issues a receipt; rejection retains the payment for audit.">
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm text-slate-600">{rows.length} payment{rows.length === 1 ? "" : "s"} waiting for review</p></div><button type="button" onClick={refresh} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"><RefreshCw className="h-4 w-4" />Refresh queue</button></div>
      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      {error && <PortalError message={error} />}
      {loading ? <PortalLoading /> : rows.length === 0 ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center"><Check className="mx-auto h-8 w-8 text-emerald-600" /><h2 className="mt-3 font-semibold">Queue is clear</h2><p className="mt-1 text-sm text-slate-500">New unmatched payments will appear here.</p></div> : <section className="space-y-3">{rows.map((row) => <article key={row.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(20,30,60,.035)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">{money(row.amountRupee)}</h2><span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">Needs matching</span></div><p className="mt-2 text-sm text-slate-600">{row.source.replaceAll("_", " ")} · {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.receivedAt))}</p><p className="mt-1 text-xs text-slate-500">{row.gatewayRef ? <>Reference <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">{row.gatewayRef}</code></> : "No gateway reference"}</p>{row.notes && <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-500">{row.notes}</p>}</div>
          {row.gatewayRef && <button type="button" onClick={() => void navigator.clipboard?.writeText(row.gatewayRef ?? "")} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"><Copy className="h-3.5 w-3.5" />Copy ref</button>}
        </div>
        <div className="mt-5 grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] md:items-end">
          <label className="block text-xs font-semibold text-slate-600">Student ID to match<input value={studentIds[row.id] ?? ""} onChange={(event) => setStudentIds((current) => ({ ...current, [row.id]: event.target.value }))} placeholder="e.g. STU-1042" className="mt-1.5 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" /></label>
          <label className="block text-xs font-semibold text-slate-600">Rejection reason (optional)<input value={reasons[row.id] ?? ""} onChange={(event) => setReasons((current) => ({ ...current, [row.id]: event.target.value }))} placeholder="Why this transfer cannot be matched" className="mt-1.5 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" /></label>
          <button type="button" disabled={busyId === row.id} onClick={() => void resolve(row, "match")} className="tracky-button-primary min-h-10 justify-center disabled:opacity-50"><Check className="h-4 w-4" />Match</button>
          <button type="button" disabled={busyId === row.id} onClick={() => void resolve(row, "reject")} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-rose-200 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><X className="h-4 w-4" />Reject</button>
        </div>
      </article>)}</section>}
    </div>
  </PortalShell>;
}
