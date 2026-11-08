"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, CheckCircle2, Clock3, FileText, Wallet } from "lucide-react";
import { PortalError, PortalLoading, PortalShell, usePortalSession } from "@/components/portal/PortalShell";
import InstalmentPaymentButton from "@/components/portal/InstalmentPaymentButton";

interface Instalment {
  id: string;
  seq: number;
  dueDate: string | null;
  amountRupee: number;
  paidRupee: number;
  remainingRupee: number;
  isFullyPaid: boolean;
  daysOverdue: number;
}
interface StudentDues {
  studentId: string;
  studentName: string;
  batchName: string | null;
  asOfDate: string;
  totalFeePaise: string;
  totalPaidPaise: string;
  totalOutstandingPaise: string;
  daysOverdue: number;
  isFullyPaid: boolean;
  nextDue: Instalment | null;
  instalments: Instalment[];
}
interface Receipt {
  id: string;
  receiptNo: string;
  issuedAt: string;
  studentName: string | null;
  amountPaise: string;
  source: string;
}

const currency = (amount: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
const currencyPaise = (amount: string) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(amount) / 100);
const date = (value: string | null) => value ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)) : "Date not set";

export default function ParentDuesPage() {
  const router = useRouter();
  const { user, loading: sessionLoading } = usePortalSession();
  const [students, setStudents] = useState<StudentDues[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionLoading || !user) return;
    if (user.subjectType !== "PARENT") return;
    let active = true;
    Promise.all([fetch("/api/parent/dues", { cache: "no-store" }), fetch("/api/parent/receipts", { cache: "no-store" })])
      .then(async ([duesResponse, receiptResponse]) => {
        if (!duesResponse.ok || !receiptResponse.ok) throw new Error("We couldn’t load your fee records. Please refresh and try again.");
        const [duesPayload, receiptPayload] = await Promise.all([duesResponse.json(), receiptResponse.json()]);
        if (active) {
          setStudents(duesPayload.students as StudentDues[]);
          setReceipts(receiptPayload.receipts as Receipt[]);
        }
      })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load fee records."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sessionLoading, user]);

  useEffect(() => {
    if (!sessionLoading && user && user.subjectType !== "PARENT") router.replace(user.role === "COUNSELLOR" ? "/counsellor" : "/dashboard");
  }, [sessionLoading, user, router]);

  if (sessionLoading || !user || user.subjectType !== "PARENT") return <PortalLoading />;

  return (
    <PortalShell user={user} title="Your fee overview" description="See upcoming instalments and find receipts for students linked to your account.">
      {loading ? <PortalLoading /> : error ? <PortalError message={error} /> : students.length === 0 ? <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center"><h2 className="font-semibold">No linked student records yet</h2><p className="mt-2 text-sm text-slate-500">If you expected to see a student here, contact your institute’s accounts team.</p></div> : (
        <div className="space-y-6">
          {students.map((student) => (
            <section key={student.studentId} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col justify-between gap-5 bg-gradient-to-br from-[#eff2ff] via-white to-[#f4edff] p-5 sm:flex-row sm:items-center sm:p-7">
                <div><p className="text-xs font-semibold text-slate-500">{student.studentId} · {student.batchName ?? "Student account"}</p><h2 className="mt-1 text-2xl font-bold tracking-tight">{student.studentName}</h2><p className="mt-2 text-sm text-slate-600">{student.isFullyPaid ? "All recorded instalments are paid." : student.daysOverdue > 0 ? `${student.daysOverdue} days overdue` : `Next due ${date(student.nextDue?.dueDate ?? null)}`}</p></div>
                <div className="rounded-xl border border-white/80 bg-white/80 p-4 sm:min-w-52"><p className="text-xs font-medium text-slate-500">Outstanding balance</p><p className="mt-1 text-2xl font-bold tracking-tight text-slate-950">{currencyPaise(student.totalOutstandingPaise)}</p><p className="mt-1 text-xs text-slate-500">of {currencyPaise(student.totalFeePaise)} total fees</p></div>
              </div>
              <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_.75fr]">
                <div><div className="mb-3 flex items-center gap-2"><Clock3 className="h-4 w-4 text-[#5470ff]" /><h3 className="font-semibold">Instalments</h3></div><div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                  {student.instalments.map((instalment) => <div key={instalment.id} className="flex flex-wrap items-center justify-between gap-3 p-3.5 sm:px-4"><div><p className="text-sm font-semibold">Instalment {instalment.seq}</p><p className="mt-1 text-xs text-slate-500">Due {date(instalment.dueDate)}</p></div><div className="text-right"><p className="text-sm font-semibold">{currency(instalment.amountRupee)}</p><p className={`mt-1 text-xs font-medium ${instalment.isFullyPaid ? "text-emerald-700" : instalment.daysOverdue > 0 ? "text-rose-700" : "text-amber-700"}`}>{instalment.isFullyPaid ? "Paid" : instalment.daysOverdue > 0 ? `${instalment.daysOverdue} days overdue` : `${currency(instalment.remainingRupee)} remaining`}</p>{!instalment.isFullyPaid && instalment.remainingRupee > 0 && <InstalmentPaymentButton instalmentId={instalment.id} />}</div></div>)}
                </div><p className="mt-3 text-xs leading-5 text-slate-500">Payment confirmation is handled by the configured checkout provider. Demo mode records a simulated payment and does not charge a real payment method.</p></div>
                <div><div className="mb-3 flex items-center gap-2"><Wallet className="h-4 w-4 text-[#5470ff]" /><h3 className="font-semibold">Payment summary</h3></div><div className="space-y-3 rounded-xl bg-slate-50 p-4"><div className="flex justify-between text-sm"><span className="text-slate-600">Total paid</span><strong>{currencyPaise(student.totalPaidPaise)}</strong></div><div className="flex justify-between border-t border-slate-200 pt-3 text-sm"><span className="text-slate-600">As of</span><strong>{date(student.asOfDate)}</strong></div><div className="mt-2 flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-xs leading-5 text-emerald-800"><CheckCircle2 className="h-4 w-4 shrink-0" />Your fee records are linked to your signed-in account.</div></div></div>
              </div>
            </section>
          ))}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"><div className="mb-4 flex items-center gap-2"><FileText className="h-4 w-4 text-[#5470ff]" /><h2 className="font-semibold">Receipts</h2></div><p className="-mt-2 mb-3 text-xs text-slate-500">Receipts open in a print-ready page. Use your browser’s Print command to save a copy as PDF.</p>{receipts.length === 0 ? <p className="text-sm text-slate-500">Receipts will appear here after a payment is recorded.</p> : <div className="divide-y divide-slate-100">{receipts.map((receipt) => <div key={receipt.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-semibold">{receipt.receiptNo}</p><p className="mt-1 text-xs text-slate-500">{receipt.studentName ?? "Student"} · {date(receipt.issuedAt)} · {receipt.source}</p></div><div className="flex items-center gap-3"><strong className="text-sm">{currencyPaise(receipt.amountPaise)}</strong><a href={`/api/parent/receipts/${encodeURIComponent(receipt.id)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">View receipt <ArrowUpRight className="h-3.5 w-3.5" /><span className="sr-only">receipt {receipt.receiptNo} in a new tab</span></a></div></div>)}</div>}</section>
        </div>
      )}
    </PortalShell>
  );
}
