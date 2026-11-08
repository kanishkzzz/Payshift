import { describe, it, expect } from "vitest";
import {
  generateInstalments,
  allocatePayment,
  daysOverdue,
  balance,
} from "../ledger-math";
import {
  toISTCalendarDateString,
  addMonthsToISTDate,
  calendarDaysDifferenceIST,
} from "../date-utils";

describe("Anchored Student Test Suite (Tests that come first)", () => {
  // STU-0587: ₹30,000 due 2026-10-10, ₹15,000 paid, as of 2026-11-02 → balance ₹15,000, 23 days overdue.
  it("STU-0587: ₹30,000 total fee, due 2026-10-10, ₹15,000 paid, as of 2026-11-02 -> balance ₹15,000, 23 days overdue", () => {
    const instalments = [
      { id: "inst_0587_1", seq: 1, dueDate: "2026-08-10", amountRupee: 15000 },
      { id: "inst_0587_2", seq: 2, dueDate: "2026-10-10", amountRupee: 15000, graceDays: 3 },
    ];

    const allocations = [
      { instalmentId: "inst_0587_1", amountRupee: 15000 },
    ];

    const ledger = balance(instalments, allocations);

    expect(ledger.totalFeeRupee).toBe(30000);
    expect(ledger.totalPaidRupee).toBe(15000);
    expect(ledger.totalOutstandingRupee).toBe(15000);

    const unpaidInstalment = ledger.instalments.find((i) => i.id === "inst_0587_2")!;
    expect(unpaidInstalment.remainingRupee).toBe(15000);
    expect(unpaidInstalment.isFullyPaid).toBe(false);

    // Days overdue calculation as of reference date 2026-11-02
    const overdue = daysOverdue(
      {
        dueDate: "2026-10-10",
        remainingRupee: unpaidInstalment.remainingRupee,
        graceDays: 3,
      },
      "2026-11-02",
      { graceDays: 3, graceRule: "GRACE_EXEMPTION" }
    );
    expect(overdue).toBe(23);
  });

  // STU-0412: fully paid → 0 days overdue, balance 0.
  it("STU-0412: fully paid -> 0 days overdue, balance 0", () => {
    const instalments = [
      { id: "inst_0412_1", seq: 1, dueDate: "2026-07-01", amountRupee: 10000 },
      { id: "inst_0412_2", seq: 2, dueDate: "2026-09-01", amountRupee: 10000 },
    ];

    const allocations = [
      { instalmentId: "inst_0412_1", amountRupee: 10000 },
      { instalmentId: "inst_0412_2", amountRupee: 10000 },
    ];

    const ledger = balance(instalments, allocations);
    expect(ledger.totalFeeRupee).toBe(20000);
    expect(ledger.totalPaidRupee).toBe(20000);
    expect(ledger.totalOutstandingRupee).toBe(0);
    expect(ledger.instalments.every((i) => i.isFullyPaid)).toBe(true);

    // Both instalments are past their due dates, but fully settled -> 0 days overdue
    const overdue1 = daysOverdue(
      { dueDate: "2026-07-01", remainingRupee: 0 },
      "2026-11-02"
    );
    const overdue2 = daysOverdue(
      { dueDate: "2026-09-01", remainingRupee: 0 },
      "2026-11-02"
    );

    expect(overdue1).toBe(0);
    expect(overdue2).toBe(0);
  });

  // STU-0219: due 2026-11-15, as of 2026-11-02 → not overdue.
  it("STU-0219: due 2026-11-15, as of 2026-11-02 -> not overdue (0 days overdue)", () => {
    const instalments = [
      { id: "inst_0219_1", seq: 1, dueDate: "2026-11-15", amountRupee: 25000 },
    ];

    const ledger = balance(instalments, []);
    expect(ledger.totalFeeRupee).toBe(25000);
    expect(ledger.totalPaidRupee).toBe(0);
    expect(ledger.totalOutstandingRupee).toBe(25000);

    const overdue = daysOverdue(
      {
        dueDate: "2026-11-15",
        amountRupee: 25000,
        remainingRupee: 25000,
      },
      "2026-11-02"
    );

    expect(overdue).toBe(0); // Not overdue yet
  });

  // Remainder goes to the last instalment, and the sum equals the net fee.
  it("remainder goes to the last instalment, and the sum equals the net fee", () => {
    // ₹10,000 net fee split across 3 instalments: ₹3,333 + ₹3,333 + ₹3,334 = ₹10,000
    const instalments = generateInstalments(
      BigInt(1000000), // ₹10,000 total
      BigInt(0),       // ₹0 discount
      BigInt(0),       // ₹0 registration
      3,
      "2026-06-01"
    );

    expect(instalments).toHaveLength(3);
    expect(instalments[0].amountRupee).toBe(3333);
    expect(instalments[1].amountRupee).toBe(3333);
    expect(instalments[2].amountRupee).toBe(3334);

    const sumRupee = instalments.reduce((sum, i) => sum + i.amountRupee, 0);
    expect(sumRupee).toBe(10000);
  });

  // Overpayment returns the surplus as unallocated rather than inventing a credit.
  it("overpayment returns the surplus as unallocated rather than inventing a credit", () => {
    const openInstalments = [
      { id: "inst_1", seq: 1, dueDate: "2026-08-10", amountRupee: 15000 },
      { id: "inst_2", seq: 2, dueDate: "2026-10-10", amountRupee: 15000 },
    ];

    // Payment of ₹35,000 for total outstanding ₹30,000
    const result = allocatePayment(35000, openInstalments);

    expect(result.allocations).toEqual([
      { instalmentId: "inst_1", amountRupee: 15000 },
      { instalmentId: "inst_2", amountRupee: 15000 },
    ]);
    expect(result.unallocatedRupee).toBe(5000);
    expect(result.totalAllocatedRupee).toBe(30000);
    // Verified: No credit or extra fake allocation rows were invented
    expect(result.allocations).toHaveLength(2);
  });

  // A payment exactly equal to the balance clears the instalment.
  it("a payment exactly equal to the balance clears the instalment", () => {
    const openInstalments = [
      { id: "inst_exact", seq: 1, dueDate: "2026-08-10", amountRupee: 15000 },
    ];

    const result = allocatePayment(15000, openInstalments);

    expect(result.allocations).toEqual([
      { instalmentId: "inst_exact", amountRupee: 15000 },
    ]);
    expect(result.unallocatedRupee).toBe(0);
    expect(result.totalAllocatedRupee).toBe(15000);

    // Verify derived balance is cleared
    const ledger = balance(openInstalments, result.allocations);
    expect(ledger.instalments[0].remainingRupee).toBe(0);
    expect(ledger.instalments[0].isFullyPaid).toBe(true);
    expect(ledger.totalOutstandingRupee).toBe(0);
  });

  // A payment spanning two instalments splits oldest-first.
  it("a payment spanning two instalments splits oldest-first", () => {
    const openInstalments = [
      { id: "inst_newer", seq: 2, dueDate: "2026-10-10", amountRupee: 15000 },
      { id: "inst_older", seq: 1, dueDate: "2026-08-10", amountRupee: 15000 },
    ];

    // Payment of ₹20,000: clears inst_older (₹15,000) and partially pays inst_newer (₹5,000)
    const result = allocatePayment(20000, openInstalments);

    expect(result.allocations).toEqual([
      { instalmentId: "inst_older", amountRupee: 15000 },
      { instalmentId: "inst_newer", amountRupee: 5000 },
    ]);
    expect(result.unallocatedRupee).toBe(0);
    expect(result.totalAllocatedRupee).toBe(20000);
  });

  // Zero or negative amounts are rejected.
  it("zero or negative amounts are rejected", () => {
    const validInstalment = [{ id: "inst_1", dueDate: "2026-08-10", amountRupee: 15000 }];

    // Zero payment
    expect(() => allocatePayment(0, validInstalment)).toThrow(
      /Payment amountRupee must be a positive safe integer/
    );

    // Negative payment
    expect(() => allocatePayment(-500, validInstalment)).toThrow(
      /Payment amountRupee must be a positive safe integer/
    );

    // Zero or negative total fee in generateInstalments
    expect(() => generateInstalments(0, 0, 0, 2, "2026-01-01")).toThrow(
      /Total fee must be a positive safe integer/
    );
    expect(() => generateInstalments(-10000, 0, 0, 2, "2026-01-01")).toThrow(
      /Total fee cannot be negative/
    );

    // Zero or negative allocation in balance
    expect(() =>
      balance(validInstalment, [{ instalmentId: "inst_1", amountRupee: 0 }])
    ).toThrow(/must have a positive amount/);

    expect(() =>
      balance(validInstalment, [{ instalmentId: "inst_1", amountRupee: -100 }])
    ).toThrow(/amountRupee must be a non-negative safe integer/);
  });

  // Grace rule: graceDays is 3 in schema, 0 in baseline TDD. Parameterized and tested on both sides of boundary.
  describe("Grace Rule (Parameterized Boundary Testing)", () => {
    // Due 2026-10-10, graceDays: 3 -> Grace window spans through 2026-10-13.
    const instalment = {
      dueDate: "2026-10-10",
      amountRupee: 15000,
      graceDays: 3,
    };

    it("rule GRACE_EXEMPTION: test inside boundary (day 3 of grace) -> 0 days overdue", () => {
      // 2026-10-13 is exactly 3 days after 2026-10-10 -> inside grace boundary
      const overdueOnBoundary = daysOverdue(instalment, "2026-10-13", {
        graceDays: 3,
        graceRule: "GRACE_EXEMPTION",
      });
      expect(overdueOnBoundary).toBe(0);
    });

    it("rule GRACE_EXEMPTION: test outside boundary (day 4) -> 4 days overdue (elapsed since dueDate)", () => {
      // 2026-10-14 is 4 days after 2026-10-10 -> grace breached, counts from dueDate
      const overduePastBoundary = daysOverdue(instalment, "2026-10-14", {
        graceDays: 3,
        graceRule: "GRACE_EXEMPTION",
      });
      expect(overduePastBoundary).toBe(4);
    });

    it("rule GRACE_DEDUCTED: test outside boundary (day 4) -> 1 day overdue (beyond grace)", () => {
      // 4 days - 3 grace days = 1 day overdue
      const overdueDeducted = daysOverdue(instalment, "2026-10-14", {
        graceDays: 3,
        graceRule: "GRACE_DEDUCTED",
      });
      expect(overdueDeducted).toBe(1);
    });

    it("rule with graceDays = 0 (baseline TDD): overdue starts immediately on T+1", () => {
      const overdueZeroGrace = daysOverdue(instalment, "2026-10-11", {
        graceDays: 0,
      });
      expect(overdueZeroGrace).toBe(1);
    });
  });
});

describe("IST Date Utilities", () => {
  it("formats dates and timestamps to IST calendar date strings (YYYY-MM-DD)", () => {
    // 2026-11-02 at 00:00:00 UTC is 05:30:00 IST on 2026-11-02
    expect(toISTCalendarDateString(new Date("2026-11-02T00:00:00.000Z"))).toBe("2026-11-02");

    // Direct calendar date strings are preserved
    expect(toISTCalendarDateString("2026-10-10")).toBe("2026-10-10");
  });

  it("handles midnight boundary correctly in IST without off-by-one errors", () => {
    // 18:29 UTC on Nov 2 is 23:59 IST on Nov 2
    const beforeMidnightUTC = new Date("2026-11-02T18:29:00.000Z");
    expect(toISTCalendarDateString(beforeMidnightUTC)).toBe("2026-11-02");

    // 18:31 UTC on Nov 2 is 00:01 IST on Nov 3
    const afterMidnightUTC = new Date("2026-11-02T18:31:00.000Z");
    expect(toISTCalendarDateString(afterMidnightUTC)).toBe("2026-11-03");
  });

  it("adds calendar months and clamps to end-of-month appropriately", () => {
    // Normal 1 month advance
    expect(addMonthsToISTDate("2026-08-10", 1)).toBe("2026-09-10");
    expect(addMonthsToISTDate("2026-08-10", 2)).toBe("2026-10-10");

    // Clamping Jan 31 -> Feb 28 in non-leap year 2026
    expect(addMonthsToISTDate("2026-01-31", 1)).toBe("2026-02-28");
    // Jan 31 -> March 31
    expect(addMonthsToISTDate("2026-01-31", 2)).toBe("2026-03-31");
    // Jan 31 -> April 30
    expect(addMonthsToISTDate("2026-01-31", 3)).toBe("2026-04-30");
  });

  it("calculates exact calendar day differences in IST", () => {
    // Oct 10 to Nov 2 = 21 + 2 = 23 days
    expect(calendarDaysDifferenceIST("2026-10-10", "2026-11-02")).toBe(23);
    // Same day = 0
    expect(calendarDaysDifferenceIST("2026-10-10", "2026-10-10")).toBe(0);
    // Future date = negative
    expect(calendarDaysDifferenceIST("2026-10-15", "2026-10-10")).toBe(-5);
  });
});

describe("generateInstalments", () => {
  it("splits even amounts equally with exact rupee and paise values", () => {
    // Benchmark fee plan: ₹30,000 (3,000,000 paise) in 2 instalments
    const instalments = generateInstalments(
      BigInt(3000000), // ₹30,000
      BigInt(0),       // ₹0 discount
      BigInt(500000),  // ₹5,000 registration fee
      2,
      "2026-08-10"
    );

    expect(instalments).toHaveLength(2);

    expect(instalments[0]).toEqual({
      seq: 1,
      amountRupee: 15000,
      amountPaise: BigInt(1500000),
      dueDate: "2026-08-10",
    });

    expect(instalments[1]).toEqual({
      seq: 2,
      amountRupee: 15000,
      amountPaise: BigInt(1500000),
      dueDate: "2026-09-10",
    });

    const sum = instalments.reduce((acc, i) => acc + i.amountRupee, 0);
    expect(sum).toBe(30000);
  });

  it("pushes remainder into the last instalment so the sum always matches net fee exactly", () => {
    // ₹10,000 in 3 instalments -> 3,333 + 3,333 + 3,334 = 10,000
    const instalments = generateInstalments(
      BigInt(1000000), // ₹10,000
      BigInt(0),
      BigInt(0),
      3,
      "2026-06-01"
    );

    expect(instalments).toHaveLength(3);
    expect(instalments[0].amountRupee).toBe(3333);
    expect(instalments[1].amountRupee).toBe(3333);
    expect(instalments[2].amountRupee).toBe(3334);

    const sumRupee = instalments.reduce((acc, i) => acc + i.amountRupee, 0);
    expect(sumRupee).toBe(10000);

    const sumPaise = instalments.reduce((acc, i) => acc + i.amountPaise, BigInt(0));
    expect(sumPaise).toBe(BigInt(1000000));
  });

  it("deducts discount from total before calculating instalments", () => {
    // Total ₹50,000, Discount ₹5,000 -> Net ₹45,000 across 4 instalments (11,250 each)
    const instalments = generateInstalments(
      5000000, // ₹50,000
      500000,  // ₹5,000 discount
      0,
      4,
      "2026-07-15"
    );

    expect(instalments).toHaveLength(4);
    expect(instalments[0].amountRupee).toBe(11250);
    expect(instalments[1].amountRupee).toBe(11250);
    expect(instalments[2].amountRupee).toBe(11250);
    expect(instalments[3].amountRupee).toBe(11250);

    const sumRupee = instalments.reduce((acc, i) => acc + i.amountRupee, 0);
    expect(sumRupee).toBe(45000);
  });

  it("clamps calendar due dates on month-end", () => {
    const instalments = generateInstalments(
      3000000,
      0,
      0,
      3,
      "2026-01-31"
    );

    expect(instalments[0].dueDate).toBe("2026-01-31");
    expect(instalments[1].dueDate).toBe("2026-02-28");
    expect(instalments[2].dueDate).toBe("2026-03-31");
  });

  it("throws when count is less than 1", () => {
    expect(() => generateInstalments(100000, 0, 0, 0, "2026-01-01")).toThrow(
      "Instalment count must be at least 1"
    );
  });

  it("validates registration fee and enforces non-discountable invariant", () => {
    // Negative registration fee
    expect(() =>
      generateInstalments(3000000, 0, -500000, 2, "2026-01-01")
    ).toThrow(/Registration fee cannot be negative/);

    // Registration fee exceeds total fee
    expect(() =>
      generateInstalments(3000000, 0, 4000000, 2, "2026-01-01")
    ).toThrow(/Registration fee cannot exceed total fee/);

    // Discount exceeds tuition fee (trying to discount non-refundable registration fee)
    // Total ₹30,000, Registration ₹5,000 -> Max discount is ₹25,000. Discount ₹26,000 must fail.
    expect(() =>
      generateInstalments(3000000, 2600000, 500000, 2, "2026-01-01")
    ).toThrow(/registration fee is non-discountable/);

    // 100% scholarship on tuition (discount = ₹25,000) leaves exactly registration fee (₹5,000)
    const instalments = generateInstalments(3000000, 2500000, 500000, 2, "2026-01-01");
    expect(instalments).toHaveLength(2);
    const sum = instalments.reduce((acc, i) => acc + i.amountRupee, 0);
    expect(sum).toBe(5000); // Net fee is exactly the non-discountable registration fee
  });
});

describe("allocatePayment", () => {
  it("allocates payment to oldest due date first (full payment of first instalment)", () => {
    const openInstalments = [
      { id: "inst_1", seq: 1, dueDate: "2026-08-10", amountRupee: 15000 },
      { id: "inst_2", seq: 2, dueDate: "2026-10-10", amountRupee: 15000 },
    ];

    const result = allocatePayment(15000, openInstalments);

    expect(result.allocations).toEqual([
      { instalmentId: "inst_1", amountRupee: 15000 },
    ]);
    expect(result.unallocatedRupee).toBe(0);
    expect(result.totalAllocatedRupee).toBe(15000);
  });

  it("allows partial payments across instalments", () => {
    const openInstalments = [
      { id: "inst_1", seq: 1, dueDate: "2026-08-10", amountRupee: 15000 },
      { id: "inst_2", seq: 2, dueDate: "2026-10-10", amountRupee: 15000 },
    ];

    // Payment of ₹20,000 -> ₹15,000 to inst_1, ₹5,000 to inst_2
    const result = allocatePayment(20000, openInstalments);

    expect(result.allocations).toEqual([
      { instalmentId: "inst_1", amountRupee: 15000 },
      { instalmentId: "inst_2", amountRupee: 5000 },
    ]);
    expect(result.unallocatedRupee).toBe(0);
    expect(result.totalAllocatedRupee).toBe(20000);
  });

  it("returns unallocated amount when payment exceeds total outstanding", () => {
    const openInstalments = [
      { id: "inst_1", seq: 1, dueDate: "2026-08-10", amountRupee: 15000 },
      { id: "inst_2", seq: 2, dueDate: "2026-10-10", amountRupee: 15000 },
    ];

    // Payment of ₹35,000 -> ₹15,000 to inst_1, ₹15,000 to inst_2, ₹5,000 unallocated
    const result = allocatePayment(35000, openInstalments);

    expect(result.allocations).toEqual([
      { instalmentId: "inst_1", amountRupee: 15000 },
      { instalmentId: "inst_2", amountRupee: 15000 },
    ]);
    expect(result.unallocatedRupee).toBe(5000);
    expect(result.totalAllocatedRupee).toBe(30000);
  });

  it("sorts input by oldest due date even if passed out of order", () => {
    const openInstalments = [
      { id: "inst_2", seq: 2, dueDate: "2026-10-10", amountRupee: 15000 },
      { id: "inst_1", seq: 1, dueDate: "2026-08-10", amountRupee: 15000 },
    ];

    const result = allocatePayment(10000, openInstalments);

    expect(result.allocations).toEqual([
      { instalmentId: "inst_1", amountRupee: 10000 },
    ]);
  });

  it("skips already paid instalments and applies payment to outstanding balance", () => {
    const openInstalments = [
      { id: "inst_1", seq: 1, dueDate: "2026-08-10", amountRupee: 15000, paidRupee: 15000 },
      { id: "inst_2", seq: 2, dueDate: "2026-10-10", amountRupee: 15000, remainingRupee: 10000 },
    ];

    const result = allocatePayment(8000, openInstalments);

    expect(result.allocations).toEqual([
      { instalmentId: "inst_2", amountRupee: 8000 },
    ]);
    expect(result.unallocatedRupee).toBe(0);
    expect(result.totalAllocatedRupee).toBe(8000);
  });

  it("sorts consistently when some instalments have a sequence and others do not", () => {
    // Both have the same due date. inst_with_seq has seq: 1; inst_without_seq has undefined seq.
    // Comparator must prioritize defined sequence numbers over undefined ones.
    const openInstalments = [
      { id: "inst_without_seq", dueDate: "2026-08-10", amountRupee: 10000 },
      { id: "inst_with_seq", seq: 1, dueDate: "2026-08-10", amountRupee: 10000 },
    ];

    const result = allocatePayment(5000, openInstalments);

    expect(result.allocations).toEqual([
      { instalmentId: "inst_with_seq", amountRupee: 5000 },
    ]);
  });

  it("validates consistency between amountRupee, paidRupee, and remainingRupee", () => {
    // Example: Amount ₹10,000, Paid ₹4,000, Remaining claims to be ₹8,000 (disagrees with 10k - 4k = 6k)
    const inconsistentInstalments = [
      {
        id: "inst_bad",
        dueDate: "2026-08-10",
        amountRupee: 10000,
        paidRupee: 4000,
        remainingRupee: 8000,
      },
    ];

    expect(() => allocatePayment(5000, inconsistentInstalments)).toThrow(
      /Inconsistent balance for instalment "inst_bad".*Remaining must equal Amount - Paid/
    );

    // Consistent: Amount ₹10,000, Paid ₹4,000, Remaining ₹6,000 succeeds
    const consistentInstalments = [
      {
        id: "inst_good",
        dueDate: "2026-08-10",
        amountRupee: 10000,
        paidRupee: 4000,
        remainingRupee: 6000,
      },
    ];

    const result = allocatePayment(3000, consistentInstalments);
    expect(result.allocations).toEqual([
      { instalmentId: "inst_good", amountRupee: 3000 },
    ]);
  });

  it("never mutates input objects or array", () => {
    const inst1 = { id: "inst_1", seq: 1, dueDate: "2026-08-10", amountRupee: 15000 };
    const inst2 = { id: "inst_2", seq: 2, dueDate: "2026-10-10", amountRupee: 15000 };
    const originalArray = [inst1, inst2];

    const result = allocatePayment(15000, originalArray);

    expect(result.totalAllocatedRupee).toBe(15000);
    expect(inst1.amountRupee).toBe(15000);
    expect("paidRupee" in inst1).toBe(false);
    expect(originalArray[0]).toBe(inst1);
  });
});

describe("daysOverdue", () => {
  it("computes exact benchmark overdue days (STU-0587: 23 days overdue on 2026-11-02)", () => {
    const instalment = {
      dueDate: "2026-10-10",
      amountRupee: 15000,
      paidRupee: 0,
    };

    const overdue = daysOverdue(instalment, "2026-11-02");
    expect(overdue).toBe(23);
  });

  it("returns 0 if instalment is paid, even if past due date", () => {
    const fullyPaidInstalment = {
      dueDate: "2026-08-10",
      amountRupee: 15000,
      paidRupee: 15000,
    };

    expect(daysOverdue(fullyPaidInstalment, "2026-11-02")).toBe(0);

    const zeroRemainingInstalment = {
      dueDate: "2026-08-10",
      remainingRupee: 0,
    };

    expect(daysOverdue(zeroRemainingInstalment, "2026-11-02")).toBe(0);
  });

  it("returns 0 if instalment is due today", () => {
    const dueToday = {
      dueDate: "2026-11-02",
      amountRupee: 15000,
    };

    expect(daysOverdue(dueToday, "2026-11-02")).toBe(0);
  });

  it("returns 0 if instalment is in the future", () => {
    const futureInstalment = {
      dueDate: "2026-12-10",
      amountRupee: 15000,
    };

    expect(daysOverdue(futureInstalment, "2026-11-02")).toBe(0);
  });

  it("validates consistency between amountRupee, paidRupee, and remainingRupee if all are passed", () => {
    const inconsistentInstalment = {
      dueDate: "2026-10-10",
      amountRupee: 10000,
      paidRupee: 4000,
      remainingRupee: 8000,
    };

    expect(() => daysOverdue(inconsistentInstalment, "2026-11-02")).toThrow(
      /Inconsistent balance for overdue instalment.*Remaining must equal Amount - Paid/
    );
  });

  it("explicitly handles zero-value instalments as fully settled (never overdue)", () => {
    // amountRupee = 0 with paidRupee and remainingRupee undefined
    const zeroValueInstalment = {
      dueDate: "2026-08-10",
      amountRupee: 0,
    };

    expect(daysOverdue(zeroValueInstalment, "2026-11-02")).toBe(0);

    // zero remainingRupee
    const zeroRemaining = {
      dueDate: "2026-08-10",
      remainingRupee: 0,
    };
    expect(daysOverdue(zeroRemaining, "2026-11-02")).toBe(0);
  });

  it("validates that amounts in daysOverdue are non-negative safe integers", () => {
    expect(() =>
      daysOverdue({ dueDate: "2026-10-10", amountRupee: -100 }, "2026-11-02")
    ).toThrow(/amountRupee must be a non-negative safe integer/);

    expect(() =>
      daysOverdue({ dueDate: "2026-10-10", amountRupee: 1000.5 }, "2026-11-02")
    ).toThrow(/amountRupee must be a non-negative safe integer/);
  });

  it("handles midnight boundary in IST without off-by-one errors", () => {
    const instalment = {
      dueDate: "2026-10-10",
      amountRupee: 15000,
    };

    // 2026-11-02 at 18:29:00 UTC = 23:59:00 IST on 2026-11-02 -> 23 days overdue
    const beforeMidnight = new Date("2026-11-02T18:29:00.000Z");
    expect(daysOverdue(instalment, beforeMidnight)).toBe(23);

    // 2026-11-02 at 18:31:00 UTC = 00:01:00 IST on 2026-11-03 -> 24 days overdue
    const afterMidnight = new Date("2026-11-02T18:31:00.000Z");
    expect(daysOverdue(instalment, afterMidnight)).toBe(24);
  });
});

describe("balance", () => {
  it("derives paid amounts and remaining balances purely from allocations", () => {
    const instalments = [
      { id: "inst_1", seq: 1, dueDate: "2026-08-10", amountRupee: 15000 },
      { id: "inst_2", seq: 2, dueDate: "2026-10-10", amountRupee: 15000 },
    ];

    const allocations = [
      { instalmentId: "inst_1", amountRupee: 15000 },
      { instalmentId: "inst_2", amountRupee: 5000 },
    ];

    const summary = balance(instalments, allocations);

    expect(summary.totalFeeRupee).toBe(30000);
    expect(summary.totalPaidRupee).toBe(20000);
    expect(summary.totalOutstandingRupee).toBe(10000);

    expect(summary.instalments).toHaveLength(2);
    expect(summary.instalments[0]).toEqual({
      id: "inst_1",
      seq: 1,
      dueDate: "2026-08-10",
      amountRupee: 15000,
      paidRupee: 15000,
      remainingRupee: 0,
      isFullyPaid: true,
    });

    expect(summary.instalments[1]).toEqual({
      id: "inst_2",
      seq: 2,
      dueDate: "2026-10-10",
      amountRupee: 15000,
      paidRupee: 5000,
      remainingRupee: 10000,
      isFullyPaid: false,
    });
  });

  it("handles multiple allocations to the same instalment", () => {
    const instalments = [
      { id: "inst_1", seq: 1, amountRupee: 15000 },
    ];

    const allocations = [
      { instalmentId: "inst_1", amountRupee: 7000 },
      { instalmentId: "inst_1", amountRupee: 8000 },
    ];

    const summary = balance(instalments, allocations);

    expect(summary.instalments[0].paidRupee).toBe(15000);
    expect(summary.instalments[0].remainingRupee).toBe(0);
    expect(summary.instalments[0].isFullyPaid).toBe(true);
    expect(summary.totalOutstandingRupee).toBe(0);
  });

  it("supports bigint paise inputs in instalments and allocations", () => {
    const instalments = [
      { id: "inst_1", seq: 1, amountPaise: BigInt(1500000) },
      { id: "inst_2", seq: 2, amountPaise: BigInt(1500000) },
    ];

    const allocations = [
      { instalmentId: "inst_1", amountPaise: BigInt(1500000) },
    ];

    const summary = balance(instalments, allocations);

    expect(summary.totalFeeRupee).toBe(30000);
    expect(summary.totalPaidRupee).toBe(15000);
    expect(summary.totalOutstandingRupee).toBe(15000);
    expect(summary.instalments[0].isFullyPaid).toBe(true);
    expect(summary.instalments[1].isFullyPaid).toBe(false);
  });

  it("calculates in paise throughout to prevent fractional rounding inflation (50 paise + 50 paise = ₹1, not ₹2)", () => {
    // Benchmark: Two payments of 50 paise each allocated to the same instalment
    const instalments = [
      { id: "inst_1", seq: 1, amountPaise: BigInt(100) }, // ₹1 (100 paise)
    ];

    const allocations = [
      { instalmentId: "inst_1", amountPaise: BigInt(50) }, // 50 paise
      { instalmentId: "inst_1", amountPaise: BigInt(50) }, // 50 paise
    ];

    const summary = balance(instalments, allocations);

    // Sum in paise = 100 paise = ₹1 (NOT 1 + 1 = ₹2)
    expect(summary.totalPaidRupee).toBe(1);
    expect(summary.totalFeeRupee).toBe(1);
    expect(summary.totalOutstandingRupee).toBe(0);
    expect(summary.instalments[0].paidRupee).toBe(1);
    expect(summary.instalments[0].remainingRupee).toBe(0);
    expect(summary.instalments[0].isFullyPaid).toBe(true);
  });

  it("tracks excess payment as customer credit and preserves ledger reconciliation (Total Fee + Credit - Paid = Outstanding)", () => {
    // Instalment fee ₹10,000, Payments allocated ₹12,000
    const instalments = [
      { id: "inst_1", seq: 1, amountRupee: 10000 },
    ];

    const allocations = [
      { instalmentId: "inst_1", amountRupee: 12000 },
    ];

    const summary = balance(instalments, allocations);

    expect(summary.totalFeeRupee).toBe(10000);
    expect(summary.totalPaidRupee).toBe(12000);
    expect(summary.totalOutstandingRupee).toBe(0);
    expect(summary.totalCreditRupee).toBe(2000);

    expect(summary.instalments[0].amountRupee).toBe(10000);
    expect(summary.instalments[0].paidRupee).toBe(12000);
    expect(summary.instalments[0].remainingRupee).toBe(0);
    expect(summary.instalments[0].creditRupee).toBe(2000);
    expect(summary.instalments[0].isFullyPaid).toBe(true);

    // Strict ledger reconciliation formula: Total Fee + Total Credit - Total Paid = Total Outstanding
    expect(
      summary.totalFeeRupee + summary.totalCreditRupee! - summary.totalPaidRupee
    ).toBe(summary.totalOutstandingRupee);
  });

  it("optionally rejects overpayments when rejectOverpayment option is enabled", () => {
    const instalments = [
      { id: "inst_1", seq: 1, amountRupee: 10000 },
    ];

    const allocations = [
      { instalmentId: "inst_1", amountRupee: 12000 },
    ];

    expect(() =>
      balance(instalments, allocations, { rejectOverpayment: true })
    ).toThrow(/Allocation exceeds fee for instalment "inst_1"/);
  });

  it("rejects negative or decimal amounts in balance", () => {
    // Negative amountRupee
    expect(() =>
      balance([{ id: "inst_1", amountRupee: -500 }], [])
    ).toThrow(/amountRupee must be a non-negative safe integer/);

    // Decimal amountRupee
    expect(() =>
      balance([{ id: "inst_1", amountRupee: 1000.5 }], [])
    ).toThrow(/amountRupee must be a non-negative safe integer/);

    // Negative allocation
    expect(() =>
      balance(
        [{ id: "inst_1", amountRupee: 1000 }],
        [{ instalmentId: "inst_1", amountRupee: -50 }]
      )
    ).toThrow(/amountRupee must be a non-negative safe integer/);

    // Decimal allocation
    expect(() =>
      balance(
        [{ id: "inst_1", amountRupee: 1000 }],
        [{ instalmentId: "inst_1", amountRupee: 50.25 }]
      )
    ).toThrow(/amountRupee must be a non-negative safe integer/);
  });

  it("rejects negative or decimal amounts in allocatePayment", () => {
    expect(() => allocatePayment(-500, [])).toThrow(
      /Payment amountRupee must be a positive safe integer/
    );

    expect(() => allocatePayment(100.5, [])).toThrow(
      /Payment amountRupee must be a positive safe integer/
    );

    expect(() =>
      allocatePayment(1000, [
        { id: "inst_1", dueDate: "2026-10-10", amountRupee: 500.5 },
      ])
    ).toThrow(/Instalment amountRupee must be a non-negative safe integer/);
  });

  it("detects and rejects mismatched rupee and paise values (preventing accidental exchange)", () => {
    // Accidentally passing ₹15,000 as amountRupee and 15000 as amountPaise (instead of 1,500,000 paise)
    expect(() =>
      balance(
        [{ id: "inst_1", amountRupee: 15000, amountPaise: 15000 }],
        []
      )
    ).toThrow(/Inconsistent Instalment "inst_1": amountRupee \(₹15000\) is 1500000 paise, but amountPaise is 15000 paise/);

    expect(() =>
      allocatePayment(5000, [
        { id: "inst_1", dueDate: "2026-08-10", amountRupee: 15000, amountPaise: 15000 },
      ])
    ).toThrow(/Inconsistent amount for instalment "inst_1": amountRupee \(₹15000\) is 1500000 paise, but amountPaise is 15000 paise/);

    expect(() =>
      daysOverdue(
        { dueDate: "2026-10-10", amountRupee: 15000, amountPaise: 15000 },
        "2026-11-02"
      )
    ).toThrow(/Inconsistent amount for overdue instalment: amountRupee \(₹15000\) is 1500000 paise, but amountPaise is 15000 paise/);
  });

  it("supports instalments with amountPaise in allocatePayment and daysOverdue", () => {
    const openInstalments = [
      { id: "inst_paise_1", dueDate: "2026-08-10", amountPaise: BigInt(1500000) },
      { id: "inst_paise_2", dueDate: "2026-10-10", amountPaise: BigInt(1500000) },
    ];

    const result = allocatePayment(15000, openInstalments);
    expect(result.allocations).toEqual([
      { instalmentId: "inst_paise_1", amountRupee: 15000 },
    ]);
    expect(result.unallocatedRupee).toBe(0);

    const overdue = daysOverdue(
      { dueDate: "2026-10-10", amountPaise: BigInt(1500000) },
      "2026-11-02"
    );
    expect(overdue).toBe(23);
  });
});
