import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "../prisma";

describe("Tracky Database Schema & Seed Verification", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("should have all core tables accessible in Neon PostgreSQL", async () => {
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
      allocationCount,
      receiptCount,
      reminderCount,
      refundPolicyCount,
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
      prisma.allocation.count(),
      prisma.receipt.count(),
      prisma.reminder.count(),
      prisma.refundPolicy.count(),
      prisma.user.count(),
      prisma.auditLog.count(),
    ]);

    expect(centreCount).toBeGreaterThan(0);
    expect(batchCount).toBeGreaterThan(0);
    expect(studentCount).toBeGreaterThan(0);
    expect(guardianCount).toBeGreaterThan(0);
    expect(consentCount).toBeGreaterThan(0);
    expect(feePlanCount).toBeGreaterThan(0);
    expect(enrollmentCount).toBeGreaterThan(0);
    expect(instalmentCount).toBe(2);
    expect(paymentCount).toBe(1);
    expect(allocationCount).toBe(1);
    expect(receiptCount).toBe(1);
    expect(reminderCount).toBe(4);
    expect(refundPolicyCount).toBe(1);
    expect(userCount).toBe(3);
    expect(auditLogCount).toBe(1);
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
});
