/**
 * Pure ledger domain interfaces and input/output types.
 * All functions work with plain objects and pure calculations (no database calls).
 */

export interface GeneratedInstalment {
  seq: number;
  amountRupee: number;
  amountPaise: bigint;
  dueDate: string; // ISO calendar date in IST: YYYY-MM-DD
}

export interface OpenInstalmentInput {
  id: string;
  dueDate: string | Date;
  amountRupee?: number;
  amountPaise?: bigint | number;
  paidRupee?: number;
  paidPaise?: bigint | number;
  remainingRupee?: number;
  remainingPaise?: bigint | number;
  seq?: number;
}

export interface PaymentAllocationResult {
  allocations: Array<{
    instalmentId: string;
    amountRupee: number;
  }>;
  unallocatedRupee: number;
  totalAllocatedRupee: number;
}

export type GraceRule = "GRACE_EXEMPTION" | "GRACE_DEDUCTED";

export interface DaysOverdueOptions {
  graceDays?: number;
  graceRule?: GraceRule;
}

export interface OverdueInstalmentInput {
  dueDate: string | Date;
  amountRupee?: number;
  amountPaise?: bigint | number;
  paidRupee?: number;
  paidPaise?: bigint | number;
  remainingRupee?: number;
  remainingPaise?: bigint | number;
  graceDays?: number;
}

export interface InstalmentBalanceInput {
  id: string;
  amountRupee?: number;
  amountPaise?: bigint | number;
  seq?: number;
  dueDate?: string | Date;
}

export interface AllocationInput {
  instalmentId: string;
  amountRupee?: number;
  amountPaise?: bigint | number;
}

export interface DerivedInstalmentBalance {
  id: string;
  seq?: number;
  dueDate?: string | Date;
  amountRupee: number;
  paidRupee: number;
  remainingRupee: number;
  creditRupee?: number; // excess payments / customer credit on this instalment
  amountPaise?: bigint;
  paidPaise?: bigint;
  remainingPaise?: bigint;
  creditPaise?: bigint;
  isFullyPaid: boolean; // purely derived, not mutable
}

export interface LedgerBalanceSummary {
  totalFeeRupee: number;
  totalPaidRupee: number;
  totalOutstandingRupee: number;
  totalCreditRupee?: number; // excess payments / customer credit across ledger
  totalFeePaise?: bigint;
  totalPaidPaise?: bigint;
  totalOutstandingPaise?: bigint;
  totalCreditPaise?: bigint;
  instalments: DerivedInstalmentBalance[];
}

export interface BalanceOptions {
  rejectOverpayment?: boolean;
}

