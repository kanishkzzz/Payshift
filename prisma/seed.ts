import "dotenv/config";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("🌱 Seeding Tracky database...");

  // 1. Clean existing records in reverse dependency order
  await prisma.auditLog.deleteMany();
  await prisma.otpSession.deleteMany();
  await prisma.counsellorTask.deleteMany();
  await prisma.riskFlag.deleteMany();
  await prisma.refundCase.deleteMany();
  await prisma.refundPolicy.deleteMany();
  await prisma.reminder.deleteMany();
  await prisma.receipt.deleteMany();
  await prisma.allocation.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.instalment.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.feePlan.deleteMany();
  await prisma.consent.deleteMany();
  await prisma.guardian.deleteMany();
  await prisma.student.deleteMany();
  await prisma.batch.deleteMany();
  await prisma.user.deleteMany();
  await prisma.centre.deleteMany();

  // 2. Create Centre
  const centre = await prisma.centre.create({
    data: {
      id: "centre_kota_01",
      name: "Tracky Kota Main Campus",
      city: "Kota",
      gstin: "08AAAAA0000A1Z5",
    },
  });

  // 3. Create Staff Users with real hashed password (default: Staff@123)
  const defaultStaffHash = await bcrypt.hash("Staff@123", 10);
  await prisma.user.createMany({
    data: [
      {
        id: "usr_admin_01",
        name: "Director Admin",
        email: "admin@tracky.edu",
        passwordHash: defaultStaffHash,
        role: "ADMIN",
        centreId: centre.id,
      },
      {
        id: "usr_accounts_01",
        name: "Neha Verma (Accounts Lead)",
        email: "accounts@tracky.edu",
        passwordHash: defaultStaffHash,
        role: "ACCOUNTS",
        centreId: centre.id,
      },
      {
        id: "usr_counsellor_01",
        name: "Dr. Rajesh K (Senior Counsellor)",
        email: "counsellor@tracky.edu",
        passwordHash: defaultStaffHash,
        role: "COUNSELLOR",
        centreId: centre.id,
      },
    ],
  });

  // 4. Create Academic Batch
  const batch = await prisma.batch.create({
    data: {
      id: "batch_jee_2027",
      centreId: centre.id,
      name: "JEE Advanced 2027 Foundation Cohort",
      courseStart: new Date("2026-06-01T00:00:00.000Z"),
      courseEnd: new Date("2027-05-31T23:59:59.000Z"),
    },
  });

  // 5. Create Fee Plan: ₹30,000 total (3,000,000 paise), ₹5,000 registration fee (500,000 paise)
  const feePlan = await prisma.feePlan.create({
    data: {
      id: "plan_jee_2027_standard",
      batchId: batch.id,
      name: "JEE 2027 2-Instalment Plan",
      totalPaise: BigInt(3000000), // ₹30,000 in paise
      registrationPaise: BigInt(500000), // ₹5,000 in paise
      instalmentCount: 2,
    },
  });

  // 6. Benchmark Student STU-0587 (per HLD Section 11)
  const student = await prisma.student.create({
    data: {
      id: "STU-0587",
      name: "Aarav Sharma",
      batchId: batch.id,
      dateOfBirth: new Date("2009-08-15T00:00:00.000Z"),
      status: "ACTIVE",
    },
  });

  // 7. Guardian for STU-0587 (password: Parent@123)
  const defaultParentHash = await bcrypt.hash("Parent@123", 10);
  const guardian = await prisma.guardian.create({
    data: {
      id: "grd_aarav_sharma",
      studentId: student.id,
      name: "Rajesh Sharma",
      phone: "+919876543210",
      email: "rajesh.sharma@example.com",
      passwordHash: defaultParentHash,
      relation: "FATHER",
      preferredLang: "HI",
    },
  });

  // 8. DPDP Act 2023 Consent Audit Record
  await prisma.consent.create({
    data: {
      guardianId: guardian.id,
      studentId: student.id,
      noticeVersion: "v2026.1",
      ipAddress: "49.36.128.45",
      grantedAt: new Date("2026-06-02T10:30:00.000Z"),
    },
  });

  // 9. Enrollment
  const enrollment = await prisma.enrollment.create({
    data: {
      id: "enr_stu_0587",
      studentId: student.id,
      planId: feePlan.id,
      discountPaise: BigInt(0),
      enrolledAt: new Date("2026-06-02T10:30:00.000Z"),
    },
  });

  // 10. Scheduled Instalments for STU-0587:
  // - Instalment 1: ₹15,000, due 2026-08-10 (Paid)
  // - Instalment 2: ₹15,000, due 2026-10-10 (Unpaid -> 23 days overdue as of 2026-11-02)
  const inst1 = await prisma.instalment.create({
    data: {
      id: "inst_0587_seq_1",
      enrollmentId: enrollment.id,
      seq: 1,
      amountPaise: BigInt(1500000), // ₹15,000
      dueDate: new Date("2026-08-10T00:00:00.000Z"),
      graceDays: 3,
    },
  });

  const inst2 = await prisma.instalment.create({
    data: {
      id: "inst_0587_seq_2",
      enrollmentId: enrollment.id,
      seq: 2,
      amountPaise: BigInt(1500000), // ₹15,000
      dueDate: new Date("2026-10-10T00:00:00.000Z"), // 23 days overdue on 2026-11-02
      graceDays: 3,
    },
  });

  // 11. Payment #1 (Paid ₹15,000 for Instalment #1)
  const payment1 = await prisma.payment.create({
    data: {
      id: "pay_aarav_inst1",
      studentId: student.id,
      amountPaise: BigInt(1500000),
      source: "ONLINE_GATEWAY",
      gatewayRef: "pay_mock_gateway_aarav_001",
      receivedAt: new Date("2026-08-08T14:22:10.000Z"),
      status: "MATCHED",
      notes: "Online UPI payment via Mock Gateway",
    },
  });

  // 12. Allocation for Payment #1 -> Instalment #1 (100% matched)
  await prisma.allocation.create({
    data: {
      paymentId: payment1.id,
      instalmentId: inst1.id,
      amountPaise: BigInt(1500000),
    },
  });

  // 13. Sequential GST Receipt for Payment #1
  await prisma.receipt.create({
    data: {
      paymentId: payment1.id,
      receiptNo: "RCP-2026-KOT-0001",
      gstin: centre.gstin ?? "08AAAAA0000A1Z5",
      taxablePaise: BigInt(1271186), // ₹12,711.86 taxable @ 18% GST
      gstPaise: BigInt(228814), // ₹2,288.14 GST (CGST 9% + SGST 9%)
      issuedAt: new Date("2026-08-08T14:22:15.000Z"),
    },
  });

  // 14. Reminders for overdue Instalment #2
  await prisma.reminder.createMany({
    data: [
      {
        instalmentId: inst2.id,
        templateKey: "T_MINUS_3",
        scheduledFor: new Date("2026-10-07T09:00:00.000Z"),
        sentAt: new Date("2026-10-07T09:05:12.000Z"),
        status: "SENT",
        channel: "WHATSAPP",
        responseLog: "Delivered: msg_id_mock_001",
      },
      {
        instalmentId: inst2.id,
        templateKey: "T_ZERO",
        scheduledFor: new Date("2026-10-10T09:00:00.000Z"),
        sentAt: new Date("2026-10-10T09:04:48.000Z"),
        status: "SENT",
        channel: "WHATSAPP",
        responseLog: "Delivered: msg_id_mock_002",
      },
      {
        instalmentId: inst2.id,
        templateKey: "T_PLUS_3",
        scheduledFor: new Date("2026-10-13T09:00:00.000Z"),
        sentAt: new Date("2026-10-13T09:03:22.000Z"),
        status: "SENT",
        channel: "WHATSAPP",
        responseLog: "Delivered: msg_id_mock_003",
      },
      {
        instalmentId: inst2.id,
        templateKey: "T_PLUS_7",
        scheduledFor: new Date("2026-10-17T09:00:00.000Z"),
        sentAt: new Date("2026-10-17T09:02:10.000Z"),
        status: "SENT",
        channel: "WHATSAPP",
        responseLog: "Delivered: msg_id_mock_004",
      },
    ],
  });

  // 15. Default Versioned Refund Policy
  await prisma.refundPolicy.create({
    data: {
      version: "v2026.1",
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      publishedAt: new Date("2026-01-01T00:00:00.000Z"),
      rulesJson: {
        coolingOffDays: 7,
        registrationFeeRefundable: false,
        settlementSlaDays: 10,
        formula: "max(0, (amountPaid - registrationFee) * remainingCourseDays / totalCourseDays)",
      },
    },
  });

  // 16. Audit Log entry
  await prisma.auditLog.create({
    data: {
      actorId: "usr_admin_01",
      action: "SEED_INITIAL_DATA",
      entityType: "SYSTEM",
      entityId: "seed_v1",
      beforeState: Prisma.JsonNull,
      afterState: { seeded: true, benchmarkStudent: "STU-0587" },
    },
  });

  console.log("✅ Seed completed successfully!");
  console.log(`- Centre: ${centre.name}`);
  console.log(`- Batch: ${batch.name}`);
  console.log(`- Benchmark Student: ${student.id} (${student.name})`);
  console.log(`- Total Fee: ₹30,000 | Paid: ₹15,000 | Overdue: ₹15,000 (23 days)`);
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });