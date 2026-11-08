import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "../prisma";
import { getStudentLedger } from "@/modules/ledger";

describe("Tracky Database Schema & Seed Verification", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("should have all core tables accessible in Neon PostgreSQL with populated cohort dataset", async () => {
    const [
      centreCount,
      batchCount,
      studentCount,
      guardianCount,
      consentCount,
      feePlanCount,
      enrollmentCount,
      instalmentCount,
      paymentCount,
      paymentOrderCount,
      allocationCount,
      receiptCount,
      reminderCount,
      refundPolicyCount,
      refundCaseCount,
      attendanceCount,
      testScoreCount,
      riskFlagCount,
      counsellorTaskCount,
      userCount,
      auditLogCount,
    ] = await Promise.all([
      prisma.centre.count(),
      prisma.batch.count(),
      prisma.student.count(),
      prisma.guardian.count(),
      prisma.consent.count(),
      prisma.feePlan.count(),
      prisma.enrollment.count(),
      prisma.instalment.count(),
      prisma.payment.count(),
      prisma.paymentOrder.count(),
      prisma.allocation.count(),
      prisma.receipt.count(),
      prisma.reminder.count(),
      prisma.refundPolicy.count(),
      prisma.refundCase.count(),
      prisma.attendanceRecord.count(),
      prisma.testScore.count(),
      prisma.riskFlag.count(),
      prisma.counsellorTask.count(),
      prisma.user.count(),
      prisma.auditLog.count(),
    ]);

    expect(centreCount).toBe(2);
    expect(batchCount).toBe(4);
    expect(studentCount).toBe(63);
    expect(guardianCount).toBe(63);
    expect(consentCount).toBe(63);
    expect(feePlanCount).toBe(5);
    expect(enrollmentCount).toBe(63);
    expect(instalmentCount).toBe(125);
    expect(paymentCount).toBeGreaterThanOrEqual(79);
    expect(paymentOrderCount).toBeGreaterThanOrEqual(77);
    expect(allocationCount).toBeGreaterThanOrEqual(79);
    expect(receiptCount).toBeGreaterThanOrEqual(79);
    expect(reminderCount).toBe(112);
    expect(refundPolicyCount).toBe(1);
    expect(refundCaseCount).toBe(1);
    expect(attendanceCount).toBe(370);
    expect(testScoreCount).toBe(124);
    expect(riskFlagCount).toBe(20);
    expect(counsellorTaskCount).toBe(20);
    expect(userCount).toBe(4);
    expect(auditLogCount).toBeGreaterThanOrEqual(1);
  });

  it("should prevent cascade deletion of student to protect financial and consent records (Restrict invariant)", async () => {
    // Attempting to delete a student who has enrollments/payments must fail due to Restrict
    await expect(
      prisma.student.delete({
        where: { id: "STU-0587" },
      })
    ).rejects.toThrow();
  });

  it("should enforce enrollment uniqueness for (studentId, planId)", async () => {
    const existingEnrollment = await prisma.enrollment.findFirst();
    expect(existingEnrollment).not.toBeNull();

    // Trying to insert duplicate enrollment for same student and plan must fail
    await expect(
      prisma.enrollment.create({
        data: {
          studentId: existingEnrollment!.studentId,
          planId: existingEnrollment!.planId,
          discountPaise: BigInt(0),
        },
      })
    ).rejects.toThrow();
  });

  it("should correctly verify benchmark student STU-0587 per HLD Section 11", async () => {
    const student = await prisma.student.findUnique({
      where: { id: "STU-0587" },
      include: {
        guardians: true,
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
        payments: {
          include: {
            receipt: true,
          },
        },
      },
    });

    expect(student).not.toBeNull();
    expect(student?.name).toBe("Aarav Sharma");

    const enrollment = student?.enrollments[0];
    expect(enrollment).toBeDefined();
    expect(enrollment?.plan.totalPaise).toBe(BigInt(3000000)); // ₹30,000 in paise

    // Calculate total paid across allocations
    const totalPaidPaise =
      enrollment?.instalments.reduce((sum, inst) => {
        const instPaid = inst.allocations.reduce(
          (acc, alloc) => acc + alloc.amountPaise,
          BigInt(0)
        );
        return sum + instPaid;
      }, BigInt(0)) ?? BigInt(0);

    expect(totalPaidPaise).toBe(BigInt(1500000)); // ₹15,000 paid

    // Calculate remaining balance
    const totalDuePaise =
      enrollment?.instalments.reduce((sum, inst) => {
        const instPaid = inst.allocations.reduce(
          (acc, alloc) => acc + alloc.amountPaise,
          BigInt(0)
        );
        const instBalance = inst.amountPaise - instPaid;
        return sum + instBalance;
      }, BigInt(0)) ?? BigInt(0);

    expect(totalDuePaise).toBe(BigInt(1500000)); // ₹15,000 outstanding balance

    // Overdue check for unpaid instalment
    const unpaidInstalment = enrollment?.instalments.find((inst) => {
      const paid = inst.allocations.reduce(
        (acc, alloc) => acc + alloc.amountPaise,
        BigInt(0)
      );
      return inst.amountPaise > paid;
    });

    expect(unpaidInstalment).toBeDefined();
    expect(unpaidInstalment?.dueDate).toEqual(
      new Date("2026-10-10T00:00:00.000Z")
    );

    // Reference Date: 2026-11-02 per HLD Section 11
    const referenceDate = new Date("2026-11-02T00:00:00.000Z");
    const diffTime = referenceDate.getTime() - (unpaidInstalment?.dueDate.getTime() ?? 0);
    const daysOverdue = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    expect(daysOverdue).toBe(23); // Exactly 23 days overdue!
  });

  // Single Function Call Verification for Ledger Balances and Days Overdue
  describe("Single Function Call Ledger Computation (getStudentLedger)", () => {
    it("computes STU-0587 balance and days overdue in a single function call (₹15,000 balance, 23 days overdue)", async () => {
      const ledger = await getStudentLedger("STU-0587", "2026-11-02");

      expect(ledger.studentId).toBe("STU-0587");
      expect(ledger.studentName).toBe("Aarav Sharma");
      expect(ledger.totalFeeRupee).toBe(30000);
      expect(ledger.totalPaidRupee).toBe(15000);
      expect(ledger.totalOutstandingRupee).toBe(15000);
      expect(ledger.daysOverdue).toBe(23);
      expect(ledger.isFullyPaid).toBe(false);

      expect(ledger.instalments).toHaveLength(2);
      expect(ledger.instalments[0].isFullyPaid).toBe(true);
      expect(ledger.instalments[0].remainingRupee).toBe(0);
      expect(ledger.instalments[0].daysOverdue).toBe(0);

      expect(ledger.instalments[1].isFullyPaid).toBe(false);
      expect(ledger.instalments[1].remainingRupee).toBe(15000);
      expect(ledger.instalments[1].daysOverdue).toBe(23);
    });

    it("computes STU-0412 balance and days overdue in a single function call (fully paid -> 0 days overdue, 0 balance)", async () => {
      const ledger = await getStudentLedger("STU-0412", "2026-11-02");

      expect(ledger.studentId).toBe("STU-0412");
      expect(ledger.studentName).toBe("Priya Patel");
      expect(ledger.totalFeeRupee).toBe(20000);
      expect(ledger.totalPaidRupee).toBe(20000);
      expect(ledger.totalOutstandingRupee).toBe(0);
      expect(ledger.daysOverdue).toBe(0);
      expect(ledger.isFullyPaid).toBe(true);

      expect(ledger.instalments).toHaveLength(2);
      expect(ledger.instalments.every((i) => i.isFullyPaid)).toBe(true);
      expect(ledger.instalments.every((i) => i.daysOverdue === 0)).toBe(true);
    });

    it("computes STU-0219 balance and days overdue in a single function call (due 2026-11-15 -> not overdue)", async () => {
      const ledger = await getStudentLedger("STU-0219", "2026-11-02");

      expect(ledger.studentId).toBe("STU-0219");
      expect(ledger.studentName).toBe("Rohan Gupta");
      expect(ledger.totalFeeRupee).toBe(25000);
      expect(ledger.totalPaidRupee).toBe(0);
      expect(ledger.totalOutstandingRupee).toBe(25000);
      expect(ledger.daysOverdue).toBe(0); // Due on Nov 15, reference is Nov 2 -> not overdue
      expect(ledger.isFullyPaid).toBe(false);

      expect(ledger.instalments).toHaveLength(1);
      expect(ledger.instalments[0].isFullyPaid).toBe(false);
      expect(ledger.instalments[0].remainingRupee).toBe(25000);
      expect(ledger.instalments[0].daysOverdue).toBe(0);
    });
  });
});
