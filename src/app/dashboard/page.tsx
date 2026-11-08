"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, RefreshCw } from "lucide-react";
import { PortalError, PortalLoading, PortalShell, usePortalSession } from "@/components/portal/PortalShell";

interface DuesSummary {
  asOf: string;
  totalOutstandingPaise: string;
  totalOverduePaise: string;
  notYetDuePaise: string;
  buckets: { CURRENT: string; CRITICAL: string; DEFAULT_RISK: string };
  over60Percent: number;
  students: Array<{ studentId: string; studentName: string; batchName: string; centreName: string; outstandingPaise: string; overduePaise: string; maxDaysOverdue: number; bucket: string | null }>;
}
interface ActivityCounts { unmatched: number; refunds: number }

const money = (paise: string) => {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(paise) / 100);
};

export default function AccountsDashboardPage() {
  const router = useRouter();
  const { user, loading: sessionLoading } = usePortalSession();
  const [summary, setSummary] = useState<DuesSummary | null>(null);
  const [activity, setActivity] = useState<ActivityCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || sessionLoading || user.subjectType !== "STAFF" || user.role === "COUNSELLOR") return;
    let active = true;
    Promise.all([
      fetch("/api/staff/dues", { cache: "no-store" }),
      fetch("/api/staff/unmatched-payments", { cache: "no-store" }),
      fetch("/api/staff/refunds?status=PENDING", { cache: "no-store" }),
    ]).then(async ([duesResponse, unmatchedResponse, refundsResponse]) => {
      if (!duesResponse.ok) throw new Error("We couldn’t load the dues summary. Please refresh and try again.");
      const [dues, unmatched, refunds] = await Promise.all([duesResponse.json(), unmatchedResponse.json(), refundsResponse.json()]);
      if (active) {
        setSummary(dues as DuesSummary);
        setActivity({ unmatched: unmatchedResponse.ok ? Number(unmatched.count ?? 0) : 0, refunds: refundsResponse.ok && Array.isArray(refunds) ? refunds.length : 0 });
      }
    }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load the accounts overview."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user, sessionLoading]);

  useEffect(() => {
    if (sessionLoading || !user) return;
    if (user.subjectType === "PARENT") router.replace("/parent/dues");
    else if (user.role === "COUNSELLOR") router.replace("/counsellor");
  }, [sessionLoading, user, router]);

  if (sessionLoading || !user || user.subjectType !== "STAFF" || user.role === "COUNSELLOR") return <PortalLoading />;

  return (
    <PortalShell user={user} title="Accounts overview" description="A live summary of recorded fee balances and the exceptions that need a closer look.">
      {loading ? <PortalLoading /> : error ? <PortalError message={error} /> : summary && activity ? <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Total outstanding" value={money(summary.totalOutstandingPaise)} detail={`As of ${summary.asOf}`} tone="indigo" />
          <Metric label="Overdue" value={money(summary.totalOverduePaise)} detail="Past the instalment due date" tone="rose" />
          <Metric label="Not yet due" value={money(summary.notYetDuePaise)} detail="Scheduled for a future date" tone="blue" />
          <Metric label="Needs review" value={`${activity.unmatched + activity.refunds}`} detail={`${activity.unmatched} unmatched · ${activity.refunds} pending refunds`} tone="amber" />
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold">Ageing balance</h2><p className="mt-1 text-sm text-slate-500">Outstanding amount grouped by days past due.</p></div><Link href="/" className="text-xs font-semibold text-[#5470ff] hover:underline">Product overview <ArrowRight className="inline h-3.5 w-3.5" /></Link></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3"><Bucket label="0–30 days" value={money(summary.buckets.CURRENT)} color="bg-emerald-500" /><Bucket label="31–60 days" value={money(summary.buckets.CRITICAL)} color="bg-amber-500" /><Bucket label="60+ days" value={money(summary.buckets.DEFAULT_RISK)} color="bg-rose-500" /></div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="flex h-full"><span className="bg-emerald-500" style={{ width: `${ratio(summary.buckets.CURRENT, summary.totalOutstandingPaise)}%` }} /><span className="bg-amber-500" style={{ width: `${ratio(summary.buckets.CRITICAL, summary.totalOutstandingPaise)}%` }} /><span className="bg-rose-500" style={{ width: `${ratio(summary.buckets.DEFAULT_RISK, summary.totalOutstandingPaise)}%` }} /></div></div>
          <p className="mt-3 text-xs text-slate-500">{summary.over60Percent}% of outstanding is over 60 days. This is a reporting signal, not a student risk score.</p>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5 sm:px-7"><h2 className="text-lg font-semibold">Students with overdue balances</h2><p className="mt-1 text-sm text-slate-500">Ordered by longest overdue balance.</p></div>
          {summary.students.length === 0 ? <p className="p-7 text-sm text-slate-500">No overdue balances were found for this view.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-5 py-3 font-medium sm:px-7">Student</th><th className="px-5 py-3 font-medium">Centre / batch</th><th className="px-5 py-3 font-medium">Overdue</th><th className="px-5 py-3 font-medium">Outstanding</th></tr></thead><tbody className="divide-y divide-slate-100">{summary.students.map((student) => <tr key={student.studentId}><td className="px-5 py-4 sm:px-7"><strong className="block">{student.studentName}</strong><span className="text-xs text-slate-500">{student.studentId}</span></td><td className="px-5 py-4"><span className="block text-xs">{student.centreName}</span><span className="mt-1 block text-xs text-slate-500">{student.batchName}</span></td><td className="px-5 py-4"><strong>{money(student.overduePaise)}</strong><span className="mt-1 block text-xs text-slate-500">{student.maxDaysOverdue} days</span></td><td className="px-5 py-4 font-semibold">{money(student.outstandingPaise)}</td></tr>)}</tbody></table></div>}
        </section>
        <p className="flex items-start gap-2 rounded-xl border border-indigo-100 bg-indigo-50/70 p-4 text-xs leading-5 text-indigo-900"><RefreshCw className="mt-0.5 h-4 w-4 shrink-0" />This view is read-only. Use the backend CSV receipt export for accounting handoff; live Tally sync and payment processing are not connected in this demo.</p>
      </div> : null}
    </PortalShell>
  );
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) {
  const tones: Record<string, string> = { indigo: "border-indigo-200 bg-indigo-50/70", rose: "border-rose-200 bg-rose-50/70", blue: "border-sky-200 bg-sky-50/70", amber: "border-amber-200 bg-amber-50/70" };
  return <div className={`rounded-2xl border p-4 ${tones[tone]}`}><p className="text-xs font-medium text-slate-600">{label}</p><p className="mt-2 text-2xl font-bold tracking-tight">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>;
}
function Bucket({ label, value, color }: { label: string; value: string; color: string }) {
  return <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-4"><span className={`h-9 w-1.5 rounded-full ${color}`} /><div><p className="text-xs text-slate-500">{label}</p><strong className="mt-1 block text-lg">{value}</strong></div></div>;
}
function ratio(value: string, total: string) {
  const all = Number(total);
  return all > 0 ? Math.min(100, (Number(value) / all) * 100) : 0;
}
