import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Banknote,
  BookOpenCheck,
  Check,
  CheckCheck,
  ChevronDown,
  Clock3,
  CreditCard,
  FileCheck2,
  FileSpreadsheet,
  Fingerprint,
  Layers3,
  Mail,
  MessageSquareText,
  MoreHorizontal,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Search,
  Smartphone,
  UserRoundCheck,
  UsersRound,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import LandingExperience, {
  LandingActionButton,
} from "@/components/landing/LandingExperience";
import TrackyBrandIcon from "@/components/TrackyBrandIcon";
import InstituteLandscapeBanner from "@/components/landing/InstituteLandscapeBanner";
import MiniGlobe from "@/components/landing/MiniGlobe";

const faqs = [
  {
    question: "What can I explore in the demo today?",
    answer:
      "The current build includes parent OTP sign-in, dues, checkout and receipts; accounts workflows for ageing, payment matching, refunds and exports; and counsellor review tasks. The demo uses seeded records. Payment behavior depends on the configured provider, and refund cases track review and settlement without transferring money.",
  },
  {
    question: "How are fee reminders localized?",
    answer:
      "Each guardian has an English or Hindi preference. The reminder scheduler uses that preference for fee messages and suppresses a reminder when an instalment is already paid. Live WhatsApp and SMS provider connections are not part of this demo.",
  },
  {
    question: "Does Tracky sync live with Tally?",
    answer:
      "No live two-way sync is connected. Accounts staff can generate a downloadable receipt export for a selected date range; the export is currently CSV, not a live Tally connection.",
  },
  {
    question: "How are refunds calculated?",
    answer:
      "The refund engine applies versioned, configurable rules such as the cooling-off period, registration-fee treatment, and remaining course days. It tracks review and settlement status; it does not send money to a bank account.",
  },
];

function BrandMark() {
  return (
    <TrackyBrandIcon className="h-8 w-8 rounded-[9px] shadow-[0_4px_10px_rgba(84,112,255,.22)]" />
  );
}

const ledgerRows = [
  {
    initials: "AS",
    name: "Aarav Sharma",
    batch: "JEE Main · Batch A",
    installment: "2 of 4",
    due: "08 Nov 2026",
    status: "Paid",
    amount: "₹25,000",
  },
  {
    initials: "PP",
    name: "Priya Patel",
    batch: "NEET · Batch B",
    installment: "2 of 4",
    due: "07 Nov 2026",
    status: "Overdue",
    amount: "₹25,000",
  },
  {
    initials: "RD",
    name: "Rohan Das",
    batch: "NEET · Batch B",
    installment: "1 of 4",
    due: "08 Nov 2026",
    status: "Overdue",
    amount: "₹25,000",
  },
  {
    initials: "AI",
    name: "Ananya Iyer",
    batch: "JEE Main · Batch A",
    installment: "1 of 4",
    due: "05 Nov 2026",
    status: "Paid",
    amount: "₹25,000",
  },
  {
    initials: "PP",
    name: "Priya Patel",
    batch: "JEE Main · Batch A",
    installment: "2 of 4",
    due: "02 Nov 2026",
    status: "Due",
    amount: "₹25,000",
  },
  {
    initials: "RD",
    name: "Rohan Das",
    batch: "NEET · Batch B",
    installment: "1 of 4",
    due: "01 Nov 2026",
    status: "Overdue",
    amount: "₹25,000",
  },
];

function LandingLedgerPreview() {
  return (
    <div
      className="tracky-dashboard-stage"
      role="img"
      aria-label="Sample Tracky fee ledger dashboard with dues reporting and recent payment activity"
    >
      <div className="tracky-dashboard-window">
        <div className="tracky-dashboard-topbar">
          <span />
          <span />
          <span />
          <small>tracky · fee operations</small>
        </div>
        <div className="tracky-dashboard-body">
          <aside className="tracky-dashboard-rail" aria-hidden="true">
            <span className="tracky-dashboard-mark">T</span>
            <span className="is-active">
              <BarChart3 />
            </span>
            <span>
              <UsersRound />
            </span>
            <span>
              <CreditCard />
            </span>
            <span>
              <ReceiptText />
            </span>
          </aside>
          <div className="tracky-dashboard-content">
            <div className="tracky-dashboard-toolbar">
              <button>
                All students <ChevronDown />
              </button>
              <button>
                Active batches <ChevronDown />
              </button>
              <label>
                <Search />
                <span>Search students</span>
              </label>
              <span className="tracky-dashboard-avatar">AK</span>
            </div>
            <div className="tracky-dashboard-heading">
              <div>
                <p>ACCOUNTS · FEE MANAGEMENT</p>
                <h2>Fee ledger</h2>
                <span>Instalments, allocations, and balances</span>
              </div>
              <button>
                Export <ArrowUpRight />
              </button>
            </div>
            <div className="tracky-dashboard-table-wrap">
              <table className="tracky-dashboard-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Batch</th>
                    <th>Instalment</th>
                    <th>Due date</th>
                    <th>Status</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerRows.map((row, index) => (
                    <tr key={`${row.name}-${index}`}>
                      <td>
                        <span
                          className={`tracky-student-avatar tracky-student-avatar-${index % 4}`}
                        >
                          {row.initials}
                        </span>
                        <strong>{row.name}</strong>
                      </td>
                      <td>{row.batch}</td>
                      <td>{row.installment} · ₹25,000</td>
                      <td>{row.due}</td>
                      <td>
                        <span
                          className={`tracky-payment-status tracky-payment-${row.status.toLowerCase()}`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="text-right font-medium text-slate-800">
                        {row.amount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="tracky-dashboard-foot">
              <span>Showing 6 of 248 students</span>
              <span>Sample data · development demo</span>
            </div>
          </div>
        </div>
      </div>
      <div className="tracky-dashboard-age-card">
        <div className="tracky-dashboard-card-heading">
          <strong>Dues by age</strong>
          <MoreHorizontal />
        </div>
        <div className="tracky-age-chart">
          <div>
            <i style={{ height: "42%" }} />
            <small>0–15</small>
          </div>
          <div>
            <i style={{ height: "68%" }} />
            <small>16–30</small>
          </div>
          <div>
            <i style={{ height: "38%" }} />
            <small>31–60</small>
          </div>
          <div>
            <i style={{ height: "82%" }} />
            <small>60+</small>
          </div>
        </div>
        <div className="tracky-chart-axis">
          <span>₹0</span>
          <span>₹2L</span>
          <span>₹4L</span>
        </div>
      </div>
      <div className="tracky-dashboard-activity">
        <div className="tracky-dashboard-card-heading">
          <strong>Recent activity</strong>
          <span>Today</span>
        </div>
        <div>
          <span className="tracky-activity-icon is-receipt">
            <ReceiptText />
          </span>
          <p>
            <b>Receipt generated</b>
            <small>Aarav Sharma · 2 min ago</small>
          </p>
        </div>
        <div>
          <span className="tracky-activity-icon is-payment">
            <CreditCard />
          </span>
          <p>
            <b>₹15,000 received via UPI</b>
            <small>Priya Patel · 8 min ago</small>
          </p>
        </div>
        <div>
          <span className="tracky-activity-icon is-receipt">
            <ReceiptText />
          </span>
          <p>
            <b>Instalment allocated</b>
            <small>Rohan Das · 14 min ago</small>
          </p>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({
  id,
  eyebrow,
  title,
  description,
  icon: Icon,
  className = "",
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <article id={id} className={`tracky-feature-card ${className}`}>
      <span className="tracky-feature-icon">
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
      </span>
      <p className="mt-5 text-[10px] font-semibold uppercase tracking-[.15em] text-slate-400">
        {eyebrow}
      </p>
      <h3 className="mt-1.5 text-[19px] font-semibold leading-tight tracking-[-.035em] text-slate-950">
        {title}
      </h3>
      <p className="mt-2 text-[13px] leading-[1.65] text-slate-600">
        {description}
      </p>
      {children}
    </article>
  );
}

export default function Home() {
  return (
    <LandingExperience>
      <main className="min-h-screen bg-[#f8f9fc] text-slate-900">
        <section className="tracky-hero relative isolate w-full overflow-hidden px-5 sm:px-8">
          <div className="tracky-hero-layout mx-auto grid max-w-[1340px] items-center gap-10 py-14 sm:py-16 lg:min-h-[600px] lg:grid-cols-[.78fr_1.22fr] lg:gap-5 lg:py-14">
            <div className="tracky-hero-content relative z-10 min-w-0 max-w-[520px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-extrabold tracking-[-.04em] text-slate-950">
                  TRACKY
                </span>
                <span className="rounded-full border border-slate-200 bg-white/70 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[.06em] text-slate-600">
                  For coaching institutes
                </span>
              </div>
              <h1 className="mt-6 max-w-[560px] font-serif text-[clamp(3.25rem,6.8vw,5.65rem)] font-medium leading-[.94] tracking-[-.055em] text-[#0b1020]">
                Every fee,
                <br />
                accounted for.
              </h1>
              <p className="mt-6 max-w-[470px] text-[16px] leading-[1.55] text-white sm:text-[18px]">
                The modern fee operations platform for coaching
                institutes?tracking dues, connecting payments, and reconciling
                every rupee.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
                <LandingActionButton
                  action="demo"
                  className="tracky-button-primary min-h-[46px] justify-center rounded-md bg-[#0b1020] px-5 shadow-none hover:bg-[#202a43]"
                >
                  Try live demo <ArrowRight className="h-4 w-4" />
                </LandingActionButton>
                <Link href="#workflow" className="tracky-hero-text-link">
                  See how it works <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>
              <p className="mt-8 text-[12px] text-white">
                Built for institute teams and the families they support.
              </p>
            </div>
            <LandingLedgerPreview />
          </div>
        </section>

        <section className="w-full px-5 pb-14 pt-16 sm:px-8 sm:pb-20 sm:pt-20">
          <div className="mx-auto grid max-w-[1200px] gap-8 sm:grid-cols-3 sm:gap-10">
            <div className="flex gap-3">
              <span className="tracky-proof-icon tracky-blue">
                <Fingerprint className="h-[18px] w-[18px]" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Identity comes from the session
                </h2>
                <p className="mt-1.5 text-sm leading-6 text-slate-600">
                  Protected parent APIs resolve the guardian from the signed-in
                  session.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="tracky-proof-icon tracky-green">
                <Banknote className="h-[18px] w-[18px]" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Amounts stay in integer paise
                </h2>
                <p className="mt-1.5 text-sm leading-6 text-slate-600">
                  Payment allocation and balance rules avoid floating-point
                  currency math.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="tracky-proof-icon tracky-orange">
                <UsersRound className="h-[18px] w-[18px]" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  People stay in the decision loop
                </h2>
                <p className="mt-1.5 text-sm leading-6 text-slate-600">
                  Risk flags create review work; they never trigger payment
                  demands.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section
          id="product"
          className="scroll-mt-24 border-y border-slate-200/80 bg-white px-5 py-16 sm:px-8 sm:py-24"
        >
          <div className="mx-auto max-w-[1200px]">
            <div className="mx-auto mb-10 max-w-[660px] text-center sm:mb-12">
              <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#5470ff]">
                What Tracky brings together
              </p>
              <h2 className="mt-3 text-[clamp(2rem,4.5vw,3.1rem)] font-bold leading-[1.04] tracking-[-.055em] text-slate-950">
                Fewer handoffs. A clearer fee picture.
              </h2>
              <p className="mt-4 text-sm leading-6 text-slate-600 sm:text-base">
                A practical toolkit for the work between a fee becoming due and
                the record being closed.
              </p>
            </div>

            <div className="grid auto-rows-fr gap-4 md:grid-cols-12">
              <article
                id="product-ledger"
                className="tracky-feature-card tracky-feature-primary scroll-mt-24 md:col-span-7"
              >
                <div className="relative z-10 max-w-[400px]">
                  <span className="tracky-feature-icon tracky-feature-icon-light">
                    <Layers3 className="h-[18px] w-[18px]" />
                  </span>
                  <p className="mt-5 text-[10px] font-semibold uppercase tracking-[.15em] text-white/60">
                    Collect and manage
                  </p>
                  <h3 className="mt-1.5 text-[24px] font-semibold leading-tight tracking-[-.04em] text-white sm:text-[28px]">
                    One fee ledger, from instalment to allocation.
                  </h3>
                  <p className="mt-3 text-[13px] leading-6 text-white/75">
                    Keep scheduled instalments, partial payments, oldest-first
                    allocation, and remaining balances in the
                    same record.
                  </p>
                </div>
                <div
                  className="tracky-ledger-preview"
                  aria-label="Sample fee ledger record"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <p className="text-[10px] font-medium text-slate-400">
                        SAMPLE STUDENT
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        Aarav Sharma{" "}
                        <span className="font-normal text-slate-400">
                          · STU-0587
                        </span>
                      </p>
                    </div>
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[9px] font-semibold text-amber-700">
                      Balance due
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 py-4">
                    <div>
                      <p className="text-[10px] text-slate-400">Scheduled</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        ₹30,000
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400">Allocated</p>
                      <p className="mt-1 text-sm font-semibold text-emerald-700">
                        ₹15,000
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400">Outstanding</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        ₹15,000
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <span className="block h-full w-1/2 rounded-full bg-gradient-to-r from-[#5470ff] to-[#8f45f2]" />
                    </span>
                    <span className="text-[10px] font-medium text-slate-500">
                      1 of 2 instalments allocated
                    </span>
                  </div>
                </div>
                <span className="tracky-feature-orb" aria-hidden="true" />
              </article>

              <FeatureCard
                id="product-dues"
                className="scroll-mt-24 md:col-span-5"
                eyebrow="See the pattern"
                title="Ageing dues, by the people who can act."
                description="Group overdue balances by centre, batch, student, and the 0–30, 31–60, and 60+ day buckets returned by reports."
                icon={BarChart3}
              >
                <div className="mt-5 grid grid-cols-3 gap-2">
                  <div className="tracky-mini-bucket">
                    <span className="bg-sky-400" />
                    <strong>0–30</strong>
                    <small>days</small>
                  </div>
                  <div className="tracky-mini-bucket">
                    <span className="bg-amber-400" />
                    <strong>31–60</strong>
                    <small>days</small>
                  </div>
                  <div className="tracky-mini-bucket">
                    <span className="bg-rose-400" />
                    <strong>60+</strong>
                    <small>days</small>
                  </div>
                </div>
              </FeatureCard>

              <FeatureCard
                id="product-parent"
                className="scroll-mt-24 md:col-span-4"
                eyebrow="For families"
                title="Payment details with a paper trail."
                description="Parent APIs cover OTP authentication, linked-student dues, payment verification, and printable receipt history."
                icon={Smartphone}
              >
                <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                      <CheckCheck className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-[11px] font-semibold text-slate-800">
                        Payment recorded
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-500">
                        Receipt available in history
                      </p>
                    </div>
                  </div>
                </div>
              </FeatureCard>

              <FeatureCard
                id="product-reminders"
                className="scroll-mt-24 md:col-span-4"
                eyebrow="Keep it considerate"
                title="Fee reminders in a familiar language."
                description="Scheduled English and Hindi templates use a guardian’s saved preference and check the balance before delivery."
                icon={MessageSquareText}
              >
                <div className="mt-5 flex gap-2">
                  <span className="rounded-full border border-slate-200 px-3 py-1.5 text-[10px] font-semibold text-slate-600">
                    EN · English
                  </span>
                  <span className="rounded-full border border-slate-200 px-3 py-1.5 text-[10px] font-semibold text-slate-600">
                    HI · हिन्दी
                  </span>
                </div>
              </FeatureCard>

              <FeatureCard
                id="product-matching"
                className="scroll-mt-24 md:col-span-4"
                eyebrow="Resolve exceptions"
                title="A queue for unmatched transfers."
                description="Accounts staff can review incoming transfers, match a student, or reject a payment with a recorded reason."
                icon={RefreshCw}
              >
                <div className="mt-5 flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-amber-400" />
                    <span className="text-[11px] font-medium text-slate-700">
                      Needs a match
                    </span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-400" />
                </div>
              </FeatureCard>

              <FeatureCard
                id="product-refunds"
                className="tracky-feature-refund scroll-mt-24 md:col-span-6"
                eyebrow="Handle exits transparently"
                title="Refund rules that can be reviewed."
                description="Preview the cooling-off period, registration-fee treatment, pro-rata basis, and configured settlement date before tracking a case."
                icon={ReceiptText}
              >
                <LandingActionButton
                  action="refund"
                  className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[#5470ff] hover:text-[#405be3]"
                >
                  Open the refund calculator{" "}
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </LandingActionButton>
                <MiniGlobe className="tracky-refund-mini-globe" size={120} />
              </FeatureCard>

              <FeatureCard
                id="product-risk"
                className="scroll-mt-24 md:col-span-6"
                eyebrow="Support with context"
                title="Signals for a person to review."
                description="Rule-based indicators draw on payment, attendance, and test trends. Counsellors review flags and manage outreach tasks."
                icon={UserRoundCheck}
              >
                <div className="mt-5 flex flex-wrap gap-2">
                  <span className="tracky-signal-chip">
                    <Check className="h-3 w-3" />
                    Rule-based
                  </span>
                  <span className="tracky-signal-chip">
                    <Check className="h-3 w-3" />
                    Template explained
                  </span>
                  <span className="tracky-signal-chip">
                    <Check className="h-3 w-3" />
                    Human reviewed
                  </span>
                </div>
              </FeatureCard>

              <FeatureCard
                id="product-tally"
                className="tracky-feature-tally scroll-mt-24 md:col-span-12"
                eyebrow="For accounting workflows"
                title="A receipt export, ready to take further."
                description="Generate a CSV receipt export for a chosen date range. Tracky does not currently provide a live two-way Tally connection."
                icon={FileSpreadsheet}
              >
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-[10px] text-slate-500">
                    tally-receipts.csv
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                    <FileCheck2 className="h-3.5 w-3.5 text-emerald-600" />
                    Date-range export
                  </span>
                </div>
              </FeatureCard>
            </div>
          </div>
        </section>

        <InstituteLandscapeBanner />

        <section
          id="workflow"
          className="tracky-flow-section scroll-mt-20 px-5 py-16 sm:px-8 sm:py-24"
        >
          <div className="mx-auto grid max-w-[1200px] items-center gap-10 lg:grid-cols-[.82fr_1.18fr] lg:gap-16">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[.17em] text-indigo-200">
                How the pieces fit
              </p>
              <h2 className="mt-4 max-w-[470px] text-[clamp(2.2rem,4.4vw,3.4rem)] font-bold leading-[1.02] tracking-[-.055em] text-white">
                From instalment to reconciliation, one connected flow.
              </h2>
              <p className="mt-5 max-w-[450px] text-sm leading-7 text-indigo-100/70">
                A scheduled fee can move through a reminder, payment,
                allocation, receipt, and reporting step — each with a clear
                record for the team that owns it.
              </p>
              <div className="mt-7 space-y-3 text-xs text-indigo-100/75">
                <p className="flex items-center gap-2">
                  <span className="tracky-flow-check">
                    <Check className="h-3 w-3" />
                  </span>
                  Oldest-first allocation for matched payments
                </p>
                <p className="flex items-center gap-2">
                  <span className="tracky-flow-check">
                    <Check className="h-3 w-3" />
                  </span>
                  Reminder idempotency and stop-on-paid checks
                </p>
                <p className="flex items-center gap-2">
                  <span className="tracky-flow-check">
                    <Check className="h-3 w-3" />
                  </span>
                  Separate counsellor review from collection actions
                </p>
              </div>
            </div>

            <div className="tracky-flow-panel">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[.13em] text-white/40">
                    A sample fee cycle
                  </p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    JEE 2027 · Kota Main Campus
                  </p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[9px] text-white/60">
                  Illustrative seeded data
                </span>
              </div>
              <div className="relative mt-5 space-y-3">
                <span className="tracky-flow-rail" aria-hidden="true" />
                <div className="tracky-flow-row">
                  <span className="tracky-flow-node tracky-flow-node-blue">
                    <BookOpenCheck className="h-4 w-4" />
                  </span>
                  <span className="flex-1">
                    <strong>Instalment scheduled</strong>
                    <small>₹15,000 · due 10 Oct 2026</small>
                  </span>
                  <span className="tracky-flow-status">Recorded</span>
                </div>
                <div className="tracky-flow-row">
                  <span className="tracky-flow-node tracky-flow-node-violet">
                    <MessageSquareText className="h-4 w-4" />
                  </span>
                  <span className="flex-1">
                    <strong>Reminder language</strong>
                    <small>Selected from guardian preference</small>
                  </span>
                  <span className="tracky-flow-status">EN / HI</span>
                </div>
                <div className="tracky-flow-row">
                  <span className="tracky-flow-node tracky-flow-node-green">
                    <Webhook className="h-4 w-4" />
                  </span>
                  <span className="flex-1">
                    <strong>Payment confirmed</strong>
                    <small>Gateway or staff-matched transfer</small>
                  </span>
                  <span className="tracky-flow-status">Verified</span>
                </div>
                <div className="tracky-flow-row">
                  <span className="tracky-flow-node tracky-flow-node-amber">
                    <ReceiptText className="h-4 w-4" />
                  </span>
                  <span className="flex-1">
                    <strong>Allocation and receipt</strong>
                    <small>Payment linked to the student record</small>
                  </span>
                  <span className="tracky-flow-status">Complete</span>
                </div>
                <span className="tracky-flow-pulse" aria-hidden="true" />
              </div>
              <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4 text-[10px] text-white/45">
                <span>Sample record: STU-0587 · Aarav Sharma</span>
                <span>Seed data</span>
              </div>
            </div>
          </div>
        </section>

        <section className="px-5 py-16 sm:px-8 sm:py-20">
          <div className="tracky-cta-section mx-auto grid max-w-[1200px] items-center gap-8 overflow-hidden rounded-[24px] px-6 py-9 sm:px-10 sm:py-11 lg:grid-cols-[1fr_.9fr]">
            <div className="relative z-10">
              <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-indigo-100/75">
                Tracky · MVP in active development
              </p>
              <h2 className="mt-3 max-w-[560px] text-[clamp(2rem,4vw,3rem)] font-bold leading-[1.03] tracking-[-.05em] text-white">
                See the workflow before you trust the promise.
              </h2>
              <p className="mt-4 max-w-[510px] text-sm leading-6 text-white/75">
                Explore the current parent, accounts, and counsellor flows, then
                try the refund calculator and ageing dues tool.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <LandingActionButton
                  action="demo"
                  className="tracky-cta-primary"
                >
                  Open the live demo <ArrowRight className="h-4 w-4" />
                </LandingActionButton>
                <LandingActionButton
                  action="refund"
                  className="tracky-cta-secondary"
                >
                  Try the refund calculator
                </LandingActionButton>
              </div>
              <p className="mt-4 text-[10px] text-white/55">
                Demo data only. No real fee payment is taken here.
              </p>
            </div>
            <div
              className="tracky-cta-preview relative z-10"
              aria-label="Tracky sample activity summary"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <span className="text-[11px] font-semibold text-white">
                  Today in the fee workflow
                </span>
                <span className="rounded-full bg-emerald-300/10 px-2 py-1 text-[9px] text-emerald-200">
                  Sample
                </span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="tracky-cta-metric">
                  <small>Instalments</small>
                  <strong>Scheduled</strong>
                  <span>Fee plan</span>
                </div>
                <div className="tracky-cta-metric">
                  <small>Payments</small>
                  <strong>Allocated</strong>
                  <span>Ledger record</span>
                </div>
                <div className="tracky-cta-metric">
                  <small>Parents</small>
                  <strong>Informed</strong>
                  <span>EN / HI message</span>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                <div className="tracky-cta-row">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                  Payment matched to a student <span>Recorded</span>
                </div>
                <div className="tracky-cta-row">
                  <span className="h-1.5 w-1.5 rounded-full bg-violet-300" />
                  Receipt number assigned <span>Ready</span>
                </div>
              </div>
            </div>
            <span
              className="tracky-cta-orb tracky-cta-orb-one"
              aria-hidden="true"
            />
            <span
              className="tracky-cta-orb tracky-cta-orb-two"
              aria-hidden="true"
            />
          </div>
        </section>

        <section
          id="security"
          className="scroll-mt-20 border-t border-slate-200 bg-white px-5 py-14 sm:px-8 sm:py-16"
        >
          <div className="mx-auto grid max-w-[1200px] gap-6 md:grid-cols-[.65fr_1.35fr] md:items-center">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#5470ff]">
                A look under the hood
              </p>
              <h2 className="mt-2 text-2xl font-bold tracking-[-.04em] text-slate-950">
                The details behind the demo.
              </h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="tracky-detail-card">
                <ShieldCheck className="h-4 w-4 text-[#5470ff]" />
                <strong>Session-scoped access</strong>
                <span>
                  Guardian APIs use the signed-in account to find linked student
                  records.
                </span>
              </div>
              <div className="tracky-detail-card">
                <Banknote className="h-4 w-4 text-emerald-600" />
                <strong>Integer currency math</strong>
                <span>
                  Financial calculations use paise to avoid floating-point
                  rounding.
                </span>
              </div>
              <div className="tracky-detail-card">
                <Clock3 className="h-4 w-4 text-amber-600" />
                <strong>In active development</strong>
                <span>
                  Consent capture and broader end-to-end browser coverage remain
                  on the roadmap.
                </span>
              </div>
            </div>
          </div>
        </section>

        <section id="faq" className="scroll-mt-20 px-5 py-16 sm:px-8 sm:py-20">
          <div className="mx-auto max-w-[760px]">
            <div className="mb-8 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#5470ff]">
                Good to know
              </p>
              <h2 className="mt-2 text-3xl font-bold tracking-[-.05em] text-slate-950">
                Questions, answered plainly.
              </h2>
            </div>
            <div className="divide-y divide-slate-200 border-y border-slate-200">
              {faqs.map((faq, index) => (
                <details
                  key={faq.question}
                  className="group py-1"
                  open={index === 0}
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-5 py-4 text-left text-sm font-semibold text-slate-900 marker:hidden sm:text-base">
                    <span>{faq.question}</span>
                    <span
                      aria-hidden="true"
                      className="text-lg font-normal text-slate-400 transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="max-w-[690px] pb-5 pr-8 text-sm leading-6 text-slate-600">
                    {faq.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <footer className="border-t border-slate-200 bg-white px-5 py-10 sm:px-8">
          <div className="mx-auto flex max-w-[1200px] flex-col justify-between gap-8 sm:flex-row sm:items-start">
            <div className="max-w-[270px]">
              <Link href="/" className="inline-flex items-center gap-2">
                <BrandMark />
                <span className="text-lg font-bold tracking-[-.04em] text-slate-950">
                  tracky
                </span>
              </Link>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                Fee operations for coaching institutes, from scheduled
                instalments to payment records and follow-up.
              </p>
              <div
                className="mt-4 flex items-center gap-2"
                aria-label="Social and contact links"
              >
                <a
                  href="https://www.linkedin.com/in/kanishk-negi-264018302/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="LinkedIn profile"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#0a66c2]/20 bg-[#eaf4ff] text-[#0a66c2] transition hover:bg-[#dbeeff]"
                >
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="h-4 w-4"
                    fill="currentColor"
                  >
                    <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14ZM8.3 10H5.7v8h2.6v-8ZM7 6.2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm11.3 7.2c0-2.4-1.3-3.6-3.1-3.6a2.7 2.7 0 0 0-2.4 1.3V10h-2.6v8h2.6v-4.1c0-1.1.2-2.2 1.6-2.2s1.4 1.3 1.4 2.3V18h2.5v-4.6Z" />
                  </svg>
                </a>
                <a
                  href="https://www.instagram.com/kanishknegi_1/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Instagram profile"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#e1306c]/20 bg-[#fff0f5] text-[#d62976] transition hover:bg-[#ffe3ee]"
                >
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="5" />
                    <circle cx="12" cy="12" r="4" />
                    <circle
                      cx="17.5"
                      cy="6.5"
                      r="1"
                      fill="currentColor"
                      stroke="none"
                    />
                  </svg>
                </a>
                <a
                  href="mailto:kanishk8negi@gmail.com"
                  aria-label="Email Kanishk"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-teal-600/20 bg-teal-50 text-teal-700 transition hover:bg-teal-100"
                >
                  <Mail className="h-4 w-4" />
                </a>
                <a
                  href="https://github.com/kanishkzzz"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="GitHub profile"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800/15 bg-slate-100 text-slate-900 transition hover:bg-slate-200"
                >
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="h-4 w-4"
                    fill="currentColor"
                  >
                    <path d="M12 .9a11.1 11.1 0 0 0-3.5 21.6c.55.1.75-.24.75-.53v-2c-3.07.67-3.72-1.3-3.72-1.3-.5-1.28-1.23-1.62-1.23-1.62-1-.69.08-.68.08-.68 1.1.08 1.68 1.14 1.68 1.14.99 1.68 2.59 1.2 3.22.92.1-.72.39-1.2.7-1.48-2.45-.28-5.03-1.23-5.03-5.47 0-1.21.43-2.2 1.14-2.97-.11-.28-.5-1.41.11-2.94 0 0 .93-.3 3.05 1.13a10.6 10.6 0 0 1 5.55 0c2.12-1.43 3.05-1.13 3.05-1.13.61 1.53.22 2.66.11 2.94.71.77 1.14 1.76 1.14 2.97 0 4.25-2.58 5.19-5.04 5.46.4.35.75 1.01.75 2.04v3.01c0 .29.2.63.76.53A11.1 11.1 0 0 0 12 .9Z" />
                  </svg>
                </a>
              </div>
            </div>
            <div> </div>
            <div className="grid grid-cols-2 gap-x-12 gap-y-6 text-sm sm:grid-cols-3">
              <div>
                <p className="font-semibold text-slate-900">Product</p>
                <div className="mt-3 grid gap-2.5 text-slate-600">
                  <Link href="#product-ledger" className="hover:text-[#5470ff]">
                    Fee ledger
                  </Link>
                  <Link href="#product-parent" className="hover:text-[#5470ff]">
                    Parent payments
                  </Link>
                  <Link
                    href="#product-refunds"
                    className="hover:text-[#5470ff]"
                  >
                    Refund cases
                  </Link>
                </div>
              </div>
              <div>
                <p className="font-semibold text-slate-900">Explore</p>
                <div className="mt-3 grid gap-2.5 text-slate-600">
                  <Link href="#workflow" className="hover:text-[#5470ff]">
                    How it works
                  </Link>
                  <Link href="#faq" className="hover:text-[#5470ff]">
                    FAQ
                  </Link>
                  <a
                    href="https://github.com/kanishkzzz/Payshift"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[#5470ff]"
                  >
                    GitHub source
                  </a>
                </div>
              </div>
              <div>
                <p className="font-semibold text-slate-900">Access</p>
                <div className="mt-3 grid gap-2.5 text-slate-600">
                  <Link href="/login" className="hover:text-[#5470ff]">
                    Log in
                  </Link>
                  <LandingActionButton
                    action="demo"
                    className="text-left hover:text-[#5470ff]"
                  >
                    Try the demo
                  </LandingActionButton>
                </div>
              </div>
            </div>
          </div>
          <div className="mx-auto mt-8 flex max-w-[1200px] flex-col gap-2 border-t border-slate-100 pt-4 text-[10px] text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <span>© 2026 Tracky · Demo project in active development</span>
            <span>
              Product capabilities are evolving; see the current build for what
              is available.
            </span>
          </div>
        </footer>

        <span className="sr-only">
          Tracky fee ledger, parent payments, dues reporting, reminders,
          reconciliation, refunds, counsellor tasks, and Tally receipt export.
        </span>
      </main>
    </LandingExperience>
  );
}
