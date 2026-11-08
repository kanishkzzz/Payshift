"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Calculator, Check, Clock3, Plus, RefreshCw, ShieldAlert, X } from "lucide-react";
import { PortalError, PortalLoading, PortalShell, useStaffAccess } from "@/components/portal/PortalShell";

type RefundStatus = "PENDING" | "APPROVED" | "REJECTED" | "SETTLED";
type ReasonCode = "STUDENT_WITHDRAWAL" | "BATCH_CANCELLED" | "MEDICAL_GROUNDS" | "DOUBLE_PAYMENT" | "OTHER";
interface RefundCase { id: string; student: { id: string; name: string }; enrollmentId: string; leaveDate: string; computedPaise: string; policyVersion: string; reasonCode: ReasonCode; reasonDetail: string | null; reasonLabel: string; status: RefundStatus; paidByDate: string; paidPaise: string; daysLeft: number | null; slaStatus: string }
interface Enrollment { id: string; student: { id: string; name: string; status: string; batch: { name: string; centre: { name: string } } }; hasOpenRefund: boolean }
interface Preview { refundPaise: string; refundableBasePaise: string; basis: string; totalDays: number; remainingDays: number; paidByDate: string; policyVersion: string; steps: string[] }
const money = (paise: string) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(paise) / 100);
const reasonLabels: Record<ReasonCode, string> = { STUDENT_WITHDRAWAL: "Student withdrawal", BATCH_CANCELLED: "Batch cancelled", MEDICAL_GROUNDS: "Medical grounds", DOUBLE_PAYMENT: "Double payment", OTHER: "Other" };

export default function RefundsPage() {
  const { user, loading: sessionLoading, allowed } = useStaffAccess(["ACCOUNTS", "ADMIN"]);
  const [cases, setCases] = useState<RefundCase[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [openForm, setOpenForm] = useState(false);
  const [enrollmentId, setEnrollmentId] = useState("");
  const [reasonCode, setReasonCode] = useState<ReasonCode>("STUDENT_WITHDRAWAL");
  const [reasonDetail, setReasonDetail] = useState("");
  const [leaveDate, setLeaveDate] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const [caseResponse, enrollmentResponse] = await Promise.all([fetch("/api/staff/refunds", { cache: "no-store" }), fetch("/api/staff/enrollments", { cache: "no-store" })]);
      const [casePayload, enrollmentPayload] = await Promise.all([caseResponse.json(), enrollmentResponse.json()]);
      if (!caseResponse.ok || !enrollmentResponse.ok) throw new Error(casePayload.error ?? enrollmentPayload.error ?? "Could not load refund records.");
      setCases(casePayload as RefundCase[]); setEnrollments(enrollmentPayload.enrollments as Enrollment[]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load refund records."); }
    finally { setLoading(false); }
  }, []);
  // The state updates are applied after load's network request settles.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (allowed) void load(); }, [allowed, load]);
  const refresh = () => { setLoading(true); setError(""); void load(); };

  const visibleCases = useMemo(() => statusFilter === "ALL" ? cases : cases.filter((item) => item.status === statusFilter), [cases, statusFilter]);

  async function calculate() {
    setBusy(true); setError(""); setPreview(null);
    try {
      if (!enrollmentId) throw new Error("Choose an enrollment first.");
      const response = await fetch("/api/staff/refunds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enrollmentId, leaveDate, reasonCode, reasonDetail: reasonCode === "OTHER" ? reasonDetail : undefined, preview: true }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? "Could not calculate the preview.");
      setPreview(payload as Preview);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not calculate the preview."); }
    finally { setBusy(false); }
  }

  async function createCase() {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/staff/refunds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enrollmentId, leaveDate, reasonCode, reasonDetail: reasonCode === "OTHER" ? reasonDetail : undefined }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? "Could not open the refund case.");
      setNotice(`Refund case opened for ${money(payload.refundPaise)} under policy ${payload.policyVersion}.`); setOpenForm(false); setPreview(null); setEnrollmentId(""); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not open the refund case."); }
    finally { setBusy(false); }
  }

  async function transition(item: RefundCase, action: "approve" | "reject" | "settle") {
    const actionLabel = action === "settle" ? "mark this refund as settled" : `${action} this refund`;
    if (!window.confirm(`Are you sure you want to ${actionLabel} for ${item.student.name} (${money(item.computedPaise)})?`)) return;
    setBusyId(item.id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/staff/refunds/${encodeURIComponent(item.id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? `Could not ${action} the case.`);
      setNotice(`Case updated to ${payload.status}.`); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : `Could not ${action} the case.`); }
    finally { setBusyId(""); }
  }

  if (sessionLoading || !allowed || !user) return <PortalLoading />;
  return <PortalShell user={user} title="Refunds" description="Calculate policy-based refunds, review pending cases, and track settlement deadlines. Opening a case marks the student as having left and stops future reminders.">
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><label className="flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600">Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="bg-transparent font-semibold text-slate-900 outline-none"><option value="ALL">All cases</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="SETTLED">Settled</option></select></label><div className="flex gap-2"><button type="button" onClick={refresh} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"><RefreshCw className="h-4 w-4" />Refresh</button><button type="button" onClick={() => { if (!openForm) setLeaveDate(new Date().toISOString().slice(0, 10)); setOpenForm((value) => !value); setError(""); }} className="tracky-button-primary min-h-10"><Plus className="h-4 w-4" />Initiate refund</button></div></div>
      {error && <PortalError message={error} />}{notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      {openForm && <section className="rounded-2xl border border-indigo-100 bg-white p-5 shadow-[0_12px_35px_rgba(39,42,92,.06)] sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#6558d9]">New case</p><h2 className="mt-1 text-lg font-semibold">Refund calculation</h2><p className="mt-1 text-sm text-slate-500">Review the policy preview before creating a case.</p></div><button type="button" aria-label="Close refund form" onClick={() => { setOpenForm(false); setPreview(null); }} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button></div>
        <div className="mt-5 grid gap-4 md:grid-cols-2"><label className="text-xs font-semibold text-slate-600">Enrollment<select value={enrollmentId} onChange={(event) => { setEnrollmentId(event.target.value); setPreview(null); }} className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"><option value="">Select an enrollment</option>{enrollments.map((row) => <option key={row.id} value={row.id} disabled={row.hasOpenRefund}>{row.student.name} · {row.student.id} · {row.student.batch.name}{row.hasOpenRefund ? " (open case exists)" : ""}</option>)}</select></label>
          <label className="text-xs font-semibold text-slate-600">Leave date<input type="date" value={leaveDate} onChange={(event) => { setLeaveDate(event.target.value); setPreview(null); }} className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" /></label>
          <label className="text-xs font-semibold text-slate-600">Reason<select value={reasonCode} onChange={(event) => { setReasonCode(event.target.value as ReasonCode); setPreview(null); }} className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100">{Object.entries(reasonLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          {reasonCode === "OTHER" && <label className="text-xs font-semibold text-slate-600">Reason details<input value={reasonDetail} onChange={(event) => setReasonDetail(event.target.value)} maxLength={500} className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" /></label>}
        </div>
        <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => void calculate()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Calculator className="h-4 w-4" />Calculate preview</button>{preview && <button type="button" disabled={busy} onClick={() => void createCase()} className="tracky-button-primary min-h-10 disabled:opacity-50"><Check className="h-4 w-4" />Create case</button>}</div>
        {preview && <div className="mt-5 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-[#6558d9]">Estimated refund · {preview.policyVersion}</p><p className="mt-1 text-2xl font-semibold">{money(preview.refundPaise)}</p></div><div className="text-right text-xs text-slate-600">{preview.remainingDays} of {preview.totalDays} days remaining<p className="mt-1">Settlement target {preview.paidByDate}</p></div></div><ul className="mt-3 space-y-1 border-t border-indigo-100 pt-3 text-xs leading-5 text-slate-600">{preview.steps.map((step) => <li key={step}>• {step}</li>)}</ul><p className="mt-3 text-[11px] text-slate-500">A case changes the student status to LEFT. Confirm the enrollment and date before creating.</p></div>}
      </section>}
      {loading ? <PortalLoading /> : visibleCases.length === 0 ? <div className="rounded-2xl border border-slate-200 bg-white p-9 text-center"><ShieldAlert className="mx-auto h-8 w-8 text-slate-400" /><h2 className="mt-3 font-semibold">No refund cases in this view</h2><p className="mt-1 text-sm text-slate-500">New requests will appear here after a policy preview is reviewed.</p></div> : <section className="space-y-3">{visibleCases.map((item) => <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(20,30,60,.035)] sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">{item.student.name}</h2><Badge value={item.status} /></div><p className="mt-1 text-xs text-slate-500">{item.student.id} · {item.reasonLabel} · Policy {item.policyVersion}</p>{item.reasonDetail && <p className="mt-2 text-sm text-slate-600">{item.reasonDetail}</p>}</div><div className="text-left sm:text-right"><p className="text-xs text-slate-500">Calculated refund</p><p className="mt-1 text-xl font-semibold">{money(item.computedPaise)}</p></div></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4"><div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500"><span><Clock3 className="mr-1 inline h-3.5 w-3.5" />Due {item.paidByDate}</span><span>Paid to date {money(item.paidPaise)}</span><span>SLA {item.slaStatus.replaceAll("_", " ")}</span></div><div className="flex flex-wrap gap-2">{item.status === "PENDING" && <><button type="button" disabled={busyId === item.id} onClick={() => void transition(item, "approve")} className="tracky-button-primary min-h-9"><Check className="h-4 w-4" />Approve</button><button type="button" disabled={busyId === item.id} onClick={() => void transition(item, "reject")} className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-rose-200 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50"><X className="h-4 w-4" />Reject</button></>}{item.status === "APPROVED" && <button type="button" disabled={busyId === item.id} onClick={() => void transition(item, "settle")} className="tracky-button-primary min-h-9"><Check className="h-4 w-4" />Mark settled</button>}</div></div></article>)}</section>}
    </div>
  </PortalShell>;
}

function Badge({ value }: { value: RefundStatus }) {
  const colors: Record<RefundStatus, string> = { PENDING: "bg-amber-50 text-amber-800", APPROVED: "bg-indigo-50 text-indigo-700", REJECTED: "bg-rose-50 text-rose-700", SETTLED: "bg-emerald-50 text-emerald-700" };
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide ${colors[value]}`}>{value}</span>;
}
