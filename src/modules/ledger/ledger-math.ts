/**
 * Pure Ledger Domain Math & Allocation Invariants.
 * 
 * Invariants:
 * 1. Zero database calls. Plain objects in, plain objects out.
 * 2. Integer rupee calculations with exact paise aggregation (no fractional rounding errors).
 * 3. Never mutate inputs or store a mutable "paid" flag; derived balances only.
 * 4. All date calculations respect Indian Standard Time (IST) calendar dates.
 * 5. Strict input validation: Non-negative safe integers only (no negative/decimal corruptions).
 */

import {
  toISTCalendarDateString,
  addMonthsToISTDate,
  calendarDaysDifferenceIST,
} from "./date-utils";
import type {
  GeneratedInstalment,
  OpenInstalmentInput,
  PaymentAllocationResult,
  OverdueInstalmentInput,
  InstalmentBalanceInput,
  AllocationInput,
  DerivedInstalmentBalance,
  LedgerBalanceSummary,
  BalanceOptions,
  DaysOverdueOptions,
  GraceRule,
} from "./types";

/**
 * Validates and converts an amount (supplied as rupee or paise) to exact BigInt paise.
 * If both are supplied, verifies they mathematically match.
 */
function parseAndValidatePaise(
  paiseVal: number | bigint | undefined,
  rupeeVal: number | undefined,
  contextLabel: string
): bigint {
  if (paiseVal === undefined && rupeeVal === undefined) {
    throw new Error(`${contextLabel} must specify either amountRupee or amountPaise`);
  }

  let fromPaise: bigint | undefined;
  if (paiseVal !== undefined) {
    if (typeof paiseVal === "bigint") {
      if (paiseVal < BigInt(0)) {
        throw new Error(`${contextLabel} (paise) cannot be negative, received: ${paiseVal}`);
      }
      fromPaise = paiseVal;
    } else {
      if (!Number.isSafeInteger(paiseVal) || paiseVal < 0) {
        throw new Error(
          `${contextLabel} (paise) must be a non-negative safe integer, received: ${paiseVal}`
        );
      }
      fromPaise = BigInt(paiseVal);
    }
  }

  let fromRupee: bigint | undefined;
  if (rupeeVal !== undefined) {
    if (!Number.isSafeInteger(rupeeVal) || rupeeVal < 0) {
      throw new Error(
        `${contextLabel}: amountRupee must be a non-negative safe integer, received: ${rupeeVal}`
      );
    }
    fromRupee = BigInt(rupeeVal) * BigInt(100);
  }

  if (fromPaise !== undefined && fromRupee !== undefined) {
    if (fromPaise !== fromRupee) {
      throw new Error(
        `Inconsistent ${contextLabel}: amountRupee (₹${rupeeVal}) is ${fromRupee} paise, but amountPaise is ${fromPaise} paise.`
      );
    }
    return fromPaise;
  }

  return fromPaise ?? fromRupee!;
}

/**
 * Helper to convert BigInt paise to integer rupee using standard mathematical rounding.
 */
function toIntegerRupee(paise: bigint): number {
  return Math.round(Number(paise) / 100);
}

/**
 * Generates scheduled fee instalments for an enrollment.
 * 
 * Rules:
 * - Works in integer rupee only.
 * - Enforces that counts and paise values are non-negative safe integers.
 * - Registration fee is strictly non-discountable under coaching institute rules.
 * - Splits net fee evenly across `count` tranches.
 * - Pushes any remainder into the LAST instalment so the sum always matches net fee exactly.
 * - Due dates are returned as IST calendar dates (YYYY-MM-DD), spaced 1 month apart starting from startDate.
 */
export function generateInstalments(
  totalPaise: number | bigint,
  discountPaise: number | bigint,
  registrationPaise: number | bigint,
  count: number,
  startDate: Date | string
): GeneratedInstalment[] {
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new Error(`Instalment count must be at least 1 (positive safe integer), received: ${count}`);
  }

  const validatePaise = (val: number | bigint, fieldName: string): bigint => {
    if (typeof val === "bigint") {
      if (val < BigInt(0)) throw new Error(`${fieldName} cannot be negative`);
      return val;
    }
    if (!Number.isSafeInteger(val)) {
      throw new Error(`${fieldName} must be a safe integer, received: ${val}`);
    }
    if (val < 0) {
      throw new Error(`${fieldName} cannot be negative (must be a non-negative safe integer), received: ${val}`);
    }
    return BigInt(val);
  };

  const totalPaiseBig = validatePaise(totalPaise, "Total fee");
  const discountPaiseBig = validatePaise(discountPaise, "Discount");
  const registrationPaiseBig = validatePaise(registrationPaise, "Registration fee");

  const totalRupee = toIntegerRupee(totalPaiseBig);
  const discountRupee = toIntegerRupee(discountPaiseBig);
  const registrationRupee = toIntegerRupee(registrationPaiseBig);

  if (totalRupee <= 0) {
    throw new Error(`Total fee must be a positive safe integer, received: ${totalRupee}`);
  }

  if (registrationRupee > totalRupee) {
    throw new Error("Registration fee cannot exceed total fee");
  }

  // Registration fee is strictly non-discountable under coaching institute rules.
  // Discounts apply only to tuition fees (total - registration).
  const maxDiscountRupee = totalRupee - registrationRupee;
  if (discountRupee > maxDiscountRupee) {
    throw new Error(
      `Discount (₹${discountRupee}) cannot exceed non-registration tuition fee (₹${maxDiscountRupee}) as registration fee is non-discountable`
    );
  }

  const netFeeRupee = totalRupee - discountRupee;

  const baseAmount = Math.floor(netFeeRupee / count);
  const remainder = netFeeRupee - (baseAmount * count);

  const instalments: GeneratedInstalment[] = [];

  for (let i = 0; i < count; i++) {
    const seq = i + 1;
    const isLast = i === count - 1;
    const amountRupee = isLast ? baseAmount + remainder : baseAmount;
    const amountPaise = BigInt(amountRupee) * BigInt(100);
    const dueDate = addMonthsToISTDate(startDate, i);

    instalments.push({
      seq,
      amountRupee,
      amountPaise,
      dueDate,
    });
  }

  return instalments;
}

/**
 * Allocates a payment amount across open fee instalments.
 * 
 * Rules:
 * - Validates amounts are non-negative safe integers.
 * - Oldest due date first (ascending order).
 * - If due dates match, prioritizes defined sequence numbers consistently, falling back to ID.
 * - Validates consistency between remainingRupee and paidRupee (Remaining = Amount - Paid).
 * - Partial payments are allowed.
 * - Any amount remaining after all open instalments are satisfied is returned as `unallocatedRupee`.
 * - Pure function: NEVER marks anything paid or mutates the input objects.
 */
export function allocatePayment(
  amountRupee: number,
  openInstalments: OpenInstalmentInput[]
): PaymentAllocationResult {
  if (!Number.isSafeInteger(amountRupee) || amountRupee <= 0) {
    throw new Error(
      `Payment amountRupee must be a positive safe integer, received: ${amountRupee}`
    );
  }

  let remainingPayment = amountRupee;
  let totalAllocatedRupee = 0;

  // Validate and normalize consistency of each instalment before allocation
  const normalizedInstalments = openInstalments.map((inst) => {
    let amountRupee = inst.amountRupee;
    if (amountRupee === undefined && inst.amountPaise !== undefined) {
      amountRupee = toIntegerRupee(BigInt(inst.amountPaise));
    }
    if (amountRupee === undefined) {
      throw new Error(
        `Instalment amountRupee must be a non-negative safe integer for "${inst.id}", received: undefined`
      );
    }
    if (!Number.isSafeInteger(amountRupee) || amountRupee < 0) {
      throw new Error(
        `Instalment amountRupee must be a non-negative safe integer for "${inst.id}", received: ${amountRupee}`
      );
    }
    if (inst.amountPaise !== undefined && inst.amountRupee !== undefined) {
      const fromPaise = BigInt(inst.amountPaise);
      const fromRupee = BigInt(inst.amountRupee) * BigInt(100);
      if (fromPaise !== fromRupee) {
        throw new Error(
          `Inconsistent amount for instalment "${inst.id}": amountRupee (₹${inst.amountRupee}) is ${fromRupee} paise, but amountPaise is ${fromPaise} paise.`
        );
      }
    }

    let paidRupee = inst.paidRupee;
    if (paidRupee === undefined && inst.paidPaise !== undefined) {
      paidRupee = toIntegerRupee(BigInt(inst.paidPaise));
    }
    if (paidRupee !== undefined) {
      if (!Number.isSafeInteger(paidRupee) || paidRupee < 0) {
        throw new Error(
          `Paid amountRupee must be a non-negative safe integer for "${inst.id}", received: ${paidRupee}`
        );
      }
      if (inst.paidPaise !== undefined && inst.paidRupee !== undefined) {
        const fromPaise = BigInt(inst.paidPaise);
        const fromRupee = BigInt(inst.paidRupee) * BigInt(100);
        if (fromPaise !== fromRupee) {
          throw new Error(
            `Inconsistent paid amount for instalment "${inst.id}": paidRupee (₹${inst.paidRupee}) is ${fromRupee} paise, but paidPaise is ${fromPaise} paise.`
          );
        }
      }
    }

    let remainingRupee = inst.remainingRupee;
    if (remainingRupee === undefined && inst.remainingPaise !== undefined) {
      remainingRupee = toIntegerRupee(BigInt(inst.remainingPaise));
    }
    if (remainingRupee !== undefined) {
      if (!Number.isSafeInteger(remainingRupee) || remainingRupee < 0) {
        throw new Error(
          `Remaining amountRupee must be a non-negative safe integer for "${inst.id}", received: ${remainingRupee}`
        );
      }
      if (inst.remainingPaise !== undefined && inst.remainingRupee !== undefined) {
        const fromPaise = BigInt(inst.remainingPaise);
        const fromRupee = BigInt(inst.remainingRupee) * BigInt(100);
        if (fromPaise !== fromRupee) {
          throw new Error(
            `Inconsistent remaining amount for instalment "${inst.id}": remainingRupee (₹${inst.remainingRupee}) is ${fromRupee} paise, but remainingPaise is ${fromPaise} paise.`
          );
        }
      }
    }

    if (inst.seq !== undefined) {
      if (!Number.isSafeInteger(inst.seq) || inst.seq < 1) {
        throw new Error(
          `Instalment seq must be a positive safe integer for "${inst.id}", received: ${inst.seq}`
        );
      }
    }

    // Invariant: Remaining = Amount - Paid when both are supplied
    if (remainingRupee !== undefined && paidRupee !== undefined) {
      const expectedRemaining = Math.max(0, amountRupee - paidRupee);
      if (remainingRupee !== expectedRemaining) {
        throw new Error(
          `Inconsistent balance for instalment "${inst.id}": amountRupee (₹${amountRupee}) - paidRupee (₹${paidRupee}) = ₹${expectedRemaining}, but remainingRupee was passed as ₹${remainingRupee}. Remaining must equal Amount - Paid.`
        );
      }
    }

    if (remainingRupee !== undefined && remainingRupee > amountRupee) {
      throw new Error(
        `Inconsistent balance for instalment "${inst.id}": remainingRupee (₹${remainingRupee}) cannot exceed amountRupee (₹${amountRupee})`
      );
    }

    return {
      ...inst,
      amountRupee,
      paidRupee,
      remainingRupee,
    };
  });

  // Clone and sort oldest due date first (IST calendar order)
  const sorted = [...normalizedInstalments].sort((a, b) => {
    const dateA = toISTCalendarDateString(a.dueDate);
    const dateB = toISTCalendarDateString(b.dueDate);
    if (dateA !== dateB) {
      return dateA.localeCompare(dateB);
    }

    const seqA = a.seq ?? Number.MAX_SAFE_INTEGER;
    const seqB = b.seq ?? Number.MAX_SAFE_INTEGER;

    if (seqA !== seqB) {
      return seqA - seqB;
    }

    return a.id.localeCompare(b.id);
  });

  const allocations: Array<{ instalmentId: string; amountRupee: number }> = [];

  for (const inst of sorted) {
    if (remainingPayment <= 0) {
      break;
    }

    let outstanding = inst.amountRupee;
    if (inst.remainingRupee !== undefined) {
      outstanding = inst.remainingRupee;
    } else if (inst.paidRupee !== undefined) {
      outstanding = Math.max(0, inst.amountRupee - inst.paidRupee);
    }

    if (outstanding <= 0) {
      continue;
    }

    const allocateAmount = Math.min(remainingPayment, outstanding);
    if (allocateAmount > 0) {
      allocations.push({
        instalmentId: inst.id,
        amountRupee: allocateAmount,
      });
      remainingPayment -= allocateAmount;
      totalAllocatedRupee += allocateAmount;
    }
  }

  return {
    allocations,
    unallocatedRupee: remainingPayment,
    totalAllocatedRupee,
  };
}

/**
 * Calculates calendar days overdue as of a given reference date.
 * 
 * Rules:
 * - Compares calendar dates in IST (+05:30) to avoid off-by-one errors near midnight.
 * - Explicitly handles zero-value instalments (always fully settled -> returns 0).
 * - Validates non-negative safe integers.
 * - Returns 0 if the instalment is already fully paid or not yet past due.
 */
export function daysOverdue(
  instalment: OverdueInstalmentInput,
  asOfDate: Date | string,
  options?: DaysOverdueOptions
): number {
  let amountRupee = instalment.amountRupee;
  if (amountRupee === undefined && instalment.amountPaise !== undefined) {
    amountRupee = toIntegerRupee(BigInt(instalment.amountPaise));
  }
  if (amountRupee !== undefined) {
    if (!Number.isSafeInteger(amountRupee) || amountRupee < 0) {
      throw new Error(
        `Instalment amountRupee must be a non-negative safe integer, received: ${amountRupee}`
      );
    }
    if (instalment.amountPaise !== undefined && instalment.amountRupee !== undefined) {
      const fromPaise = BigInt(instalment.amountPaise);
      const fromRupee = BigInt(instalment.amountRupee) * BigInt(100);
      if (fromPaise !== fromRupee) {
        throw new Error(
          `Inconsistent amount for overdue instalment: amountRupee (₹${instalment.amountRupee}) is ${fromRupee} paise, but amountPaise is ${fromPaise} paise.`
        );
      }
    }
  }

  let paidRupee = instalment.paidRupee;
  if (paidRupee === undefined && instalment.paidPaise !== undefined) {
    paidRupee = toIntegerRupee(BigInt(instalment.paidPaise));
  }
  if (paidRupee !== undefined) {
    if (!Number.isSafeInteger(paidRupee) || paidRupee < 0) {
      throw new Error(
        `Instalment paidRupee must be a non-negative safe integer, received: ${paidRupee}`
      );
    }
    if (instalment.paidPaise !== undefined && instalment.paidRupee !== undefined) {
      const fromPaise = BigInt(instalment.paidPaise);
      const fromRupee = BigInt(instalment.paidRupee) * BigInt(100);
      if (fromPaise !== fromRupee) {
        throw new Error(
          `Inconsistent paid amount for overdue instalment: paidRupee (₹${instalment.paidRupee}) is ${fromRupee} paise, but paidPaise is ${fromPaise} paise.`
        );
      }
    }
  }

  let remainingRupee = instalment.remainingRupee;
  if (remainingRupee === undefined && instalment.remainingPaise !== undefined) {
    remainingRupee = toIntegerRupee(BigInt(instalment.remainingPaise));
  }
  if (remainingRupee !== undefined) {
    if (!Number.isSafeInteger(remainingRupee) || remainingRupee < 0) {
      throw new Error(
        `Instalment remainingRupee must be a non-negative safe integer, received: ${remainingRupee}`
      );
    }
    if (instalment.remainingPaise !== undefined && instalment.remainingRupee !== undefined) {
      const fromPaise = BigInt(instalment.remainingPaise);
      const fromRupee = BigInt(instalment.remainingRupee) * BigInt(100);
      if (fromPaise !== fromRupee) {
        throw new Error(
          `Inconsistent remaining amount for overdue instalment: remainingRupee (₹${instalment.remainingRupee}) is ${fromRupee} paise, but remainingPaise is ${fromPaise} paise.`
        );
      }
    }
  }

  // Validate consistency if amount, paid, and remaining are all supplied
  if (
    amountRupee !== undefined &&
    paidRupee !== undefined &&
    remainingRupee !== undefined
  ) {
    const expectedRemaining = Math.max(0, amountRupee - paidRupee);
    if (remainingRupee !== expectedRemaining) {
      throw new Error(
        `Inconsistent balance for overdue instalment: amountRupee (₹${amountRupee}) - paidRupee (₹${paidRupee}) = ₹${expectedRemaining}, but remainingRupee was passed as ₹${remainingRupee}. Remaining must equal Amount - Paid.`
      );
    }
  }

  // Explicitly handle zero-value instalments (settled by definition, never overdue)
  if (amountRupee === 0 || remainingRupee === 0) {
    return 0;
  }

  // Check if paid
  const isPaid =
    (remainingRupee !== undefined && remainingRupee <= 0) ||
    (paidRupee !== undefined &&
      amountRupee !== undefined &&
      paidRupee >= amountRupee);

  if (isPaid) {
    return 0;
  }

  const diffDays = calendarDaysDifferenceIST(instalment.dueDate, asOfDate);
  if (diffDays <= 0) {
    return 0;
  }

  const graceDays = options?.graceDays ?? instalment.graceDays ?? 0;
  if (!Number.isSafeInteger(graceDays) || graceDays < 0) {
    throw new Error(`graceDays must be a non-negative safe integer, received: ${graceDays}`);
  }

  // If within grace window, not yet overdue
  if (diffDays <= graceDays) {
    return 0;
  }

  const graceRule = options?.graceRule ?? "GRACE_EXEMPTION";
  if (graceRule === "GRACE_DEDUCTED") {
    return diffDays - graceDays;
  }

  // Default: GRACE_EXEMPTION (once grace is breached, full overdue days since dueDate apply)
  return diffDays;
}

/**
 * Computes derived balances for instalments and summarizes the ledger.
 * 
 * Rules:
 * - Performs all internal calculations in exact paise to prevent fractional-rounding inflation
 *   (e.g., 50 paise + 50 paise = 100 paise = ₹1, not ₹1 + ₹1 = ₹2).
 * - Tracks excess payments as `creditRupee` (customer credit) to maintain strict ledger reconciliation
 *   (Total Fee + Total Credit - Total Paid = Total Outstanding).
 * - Optionally rejects overpayments when `options.rejectOverpayment` is true.
 * - Strictly validates non-negative safe integers for all rupee and paise amounts.
 * - Never stores a mutable "paid" flag.
 */
export function balance(
  instalments: InstalmentBalanceInput[],
  allocations: AllocationInput[],
  options?: BalanceOptions
): LedgerBalanceSummary {
  // Aggregate allocations by instalmentId in exact paise
  const paidPaiseByInstalment = new Map<string, bigint>();

  for (const alloc of allocations) {
    const allocPaise = parseAndValidatePaise(
      alloc.amountPaise,
      alloc.amountRupee,
      `Allocation for "${alloc.instalmentId}"`
    );
    if (allocPaise <= BigInt(0)) {
      throw new Error(
        `Allocation for "${alloc.instalmentId}" must have a positive amount, received: ${allocPaise}`
      );
    }
    const prev = paidPaiseByInstalment.get(alloc.instalmentId) ?? BigInt(0);
    paidPaiseByInstalment.set(alloc.instalmentId, prev + allocPaise);
  }

  let totalFeePaise = BigInt(0);
  let totalPaidPaise = BigInt(0);
  let totalOutstandingPaise = BigInt(0);
  let totalCreditPaise = BigInt(0);

  const derivedInstalments: DerivedInstalmentBalance[] = instalments.map((inst) => {
    const instAmountPaise = parseAndValidatePaise(
      inst.amountPaise,
      inst.amountRupee,
      `Instalment "${inst.id}"`
    );

    const paidPaise = paidPaiseByInstalment.get(inst.id) ?? BigInt(0);

    if (options?.rejectOverpayment && paidPaise > instAmountPaise) {
      const overRupee = toIntegerRupee(paidPaise - instAmountPaise);
      throw new Error(
        `Allocation exceeds fee for instalment "${inst.id}": paid ₹${toIntegerRupee(paidPaise)} exceeds amount ₹${toIntegerRupee(instAmountPaise)} by ₹${overRupee}`
      );
    }

    const remainingPaise = instAmountPaise > paidPaise ? instAmountPaise - paidPaise : BigInt(0);
    const creditPaise = paidPaise > instAmountPaise ? paidPaise - instAmountPaise : BigInt(0);

    const amountRupee = toIntegerRupee(instAmountPaise);
    const paidRupee = toIntegerRupee(paidPaise);
    const remainingRupee = toIntegerRupee(remainingPaise);
    const creditRupee = toIntegerRupee(creditPaise);
    const isFullyPaid = instAmountPaise > BigInt(0) ? paidPaise >= instAmountPaise : true;

    totalFeePaise += instAmountPaise;
    totalPaidPaise += paidPaise;
    totalOutstandingPaise += remainingPaise;
    totalCreditPaise += creditPaise;

    const derived: DerivedInstalmentBalance = {
      id: inst.id,
      seq: inst.seq,
      dueDate: inst.dueDate,
      amountRupee,
      paidRupee,
      remainingRupee,
      isFullyPaid,
    };

    if (creditRupee > 0) {
      derived.creditRupee = creditRupee;
      derived.creditPaise = creditPaise;
    }

    return derived;
  });

  return {
    totalFeeRupee: toIntegerRupee(totalFeePaise),
    totalPaidRupee: toIntegerRupee(totalPaidPaise),
    totalOutstandingRupee: toIntegerRupee(totalOutstandingPaise),
    totalCreditRupee: toIntegerRupee(totalCreditPaise),
    totalFeePaise,
    totalPaidPaise,
    totalOutstandingPaise,
    totalCreditPaise,
    instalments: derivedInstalments,
  };
}
