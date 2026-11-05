/**
 * Student Ledger Service.
 * 
 * Computes a student's complete ledger (total fee, paid amount, remaining balance,
 * and days overdue) from database records in a single function call.
 */

import { prisma } from "@/lib/prisma";
import { balance, daysOverdue } from "./ledger-math";
import { toISTCalendarDateString } from "./date-utils";
import type {
  DerivedInstalmentBalance,
  InstalmentBalanceInput,
  AllocationInput,
  DaysOverdueOptions,
} from "./types";

export interface StudentInstalmentSummary extends DerivedInstalmentBalance {
  daysOverdue: number;
}

export interface StudentLedgerSummary {
  studentId: string;
  studentName: string;
  status: string;
  batchId?: string;
  batchName?: string;
  totalFeeRupee: number;
  totalPaidRupee: number;
  totalOutstandingRupee: number;
  totalCreditRupee?: number;
  totalFeePaise?: bigint;
  totalPaidPaise?: bigint;
  totalOutstandingPaise?: bigint;
  totalCreditPaise?: bigint;
  daysOverdue: number; // Maximum days overdue across open instalments as of asOfDate (0 if none)
  isFullyPaid: boolean;
  asOfDate: string; // ISO date in IST (YYYY-MM-DD)
  instalments: StudentInstalmentSummary[];
}

/**
 * Computes a student's derived fee balance and days overdue in a single function call.
 * 
 * @param studentId The unique student ID (e.g. "STU-0587", "STU-0412", "STU-0219")
 * @param asOfDate The reference evaluation date in IST (defaults to "2026-11-02")
 * @param options Overdue options (e.g. graceDays, graceRule)
 * @returns Complete student ledger summary with derived balances and overdue days
 */
export async function getStudentLedger(
  studentId: string,
  asOfDate: Date | string = "2026-11-02",
  options?: DaysOverdueOptions
): Promise<StudentLedgerSummary> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      batch: true,
      enrollments: {
        include: {
          plan: true,
          instalments: {
            include: {
              allocations: true,
            },
            orderBy: { seq: "asc" },
          },
        },
      },
    },
  });

  if (!student) {
    throw new Error(`Student with ID "${studentId}" was not found.`);
  }

  const allInstalments: InstalmentBalanceInput[] = [];
  const allAllocations: AllocationInput[] = [];
  const metadataByInstalmentId = new Map<
    string,
    { dueDate: Date | string; graceDays: number; amountRupee: number }
  >();

  for (const enrollment of student.enrollments) {
    for (const inst of enrollment.instalments) {
      allInstalments.push({
        id: inst.id,
        seq: inst.seq,
        dueDate: inst.dueDate,
        amountPaise: inst.amountPaise,
      });

      metadataByInstalmentId.set(inst.id, {
        dueDate: inst.dueDate,
        graceDays: inst.graceDays,
        amountRupee: Math.round(Number(inst.amountPaise) / 100),
      });

      for (const alloc of inst.allocations) {
        allAllocations.push({
          instalmentId: alloc.instalmentId,
          amountPaise: alloc.amountPaise,
        });
      }
    }
  }

  // Pure derivation of balances
  const ledgerBalance = balance(allInstalments, allAllocations);

  let maxOverdueDays = 0;

  const instalmentsWithOverdue: StudentInstalmentSummary[] = ledgerBalance.instalments.map(
    (inst) => {
      const meta = metadataByInstalmentId.get(inst.id);
      const overdue = daysOverdue(
        {
          dueDate: inst.dueDate ?? meta?.dueDate ?? asOfDate,
          amountRupee: inst.amountRupee,
          paidRupee: inst.paidRupee,
          remainingRupee: inst.remainingRupee,
          graceDays: meta?.graceDays ?? 3,
        },
        asOfDate,
        options
      );

      if (!inst.isFullyPaid && overdue > maxOverdueDays) {
        maxOverdueDays = overdue;
      }

      return {
        ...inst,
        daysOverdue: overdue,
      };
    }
  );

  return {
    studentId: student.id,
    studentName: student.name,
    status: student.status,
    batchId: student.batchId,
    batchName: student.batch?.name,
    totalFeeRupee: ledgerBalance.totalFeeRupee,
    totalPaidRupee: ledgerBalance.totalPaidRupee,
    totalOutstandingRupee: ledgerBalance.totalOutstandingRupee,
    totalCreditRupee: ledgerBalance.totalCreditRupee,
    totalFeePaise: ledgerBalance.totalFeePaise,
    totalPaidPaise: ledgerBalance.totalPaidPaise,
    totalOutstandingPaise: ledgerBalance.totalOutstandingPaise,
    totalCreditPaise: ledgerBalance.totalCreditPaise,
    daysOverdue: maxOverdueDays,
    isFullyPaid: ledgerBalance.totalOutstandingRupee === 0,
    asOfDate: toISTCalendarDateString(asOfDate),
    instalments: instalmentsWithOverdue,
  };
}

// Alias for convenience
export const calculateStudentLedger = getStudentLedger;

