import "dotenv/config";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";

/**
 * Deterministic PRNG using Mulberry32 algorithm.
 * Guarantees identical random sequences given the same seed across environments.
 */
function createPRNG(seed: number) {
  let s = seed >>> 0;
  return function next(): number {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = createPRNG(20261103);

function randomInt(min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function randomChoice<T>(items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

const FIRST_NAMES = [
  "Aditya", "Ananya", "Aryan", "Diya", "Ishaan", "Kavya", "Manish", "Meera",
  "Neha", "Nikhil", "Pooja", "Pranav", "Rahul", "Rhea", "Rishi", "Sakshi",
  "Siddharth", "Sneha", "Tanvi", "Varun", "Vikram", "Yash", "Dev", "Anika",
  "Kabir", "Tara", "Arjun", "Zara", "Dhruv", "Riya"
] as const;

const LAST_NAMES = [
  "Agarwal", "Bose", "Chawla", "Deshmukh", "Ghosh", "Iyer", "Joshi", "Kapoor",
  "Malhotra", "Mehta", "Nair", "Pandey", "Rao", "Reddy", "Saxena", "Sen",
  "Sharma", "Singh", "Verma", "Yadav"
] as const;

const PARENT_PREFIXES = ["Mr. ", "Dr. ", "Mrs. ", "Prof. "] as const;

async function main() {
  console.log("🌱 Seeding Tracky database with deterministic PRNG (seed: 20261103)...");

  // 1. Idempotency: Clean existing records in strict reverse foreign key dependency order
  await prisma.auditLog.deleteMany();
  await prisma.otpSession.deleteMany();
  await prisma.session.deleteMany();
  await prisma.processedWebhookEvent.deleteMany();
  await prisma.counsellorTask.deleteMany();
  await prisma.riskFlag.deleteMany();
  await prisma.testScore.deleteMany();
  await prisma.attendanceRecord.deleteMany();
  await prisma.refundCase.deleteMany();
  await prisma.refundPolicy.deleteMany();
  await prisma.reminder.deleteMany();
  await prisma.receipt.deleteMany();
  await prisma.receiptSequence.deleteMany();
  await prisma.allocation.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.paymentOrder.deleteMany();
  await prisma.instalment.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.feePlan.deleteMany();
  await prisma.consent.deleteMany();
  await prisma.guardian.deleteMany();
  await prisma.student.deleteMany();
  await prisma.batch.deleteMany();
  await prisma.user.deleteMany();
  await prisma.centre.deleteMany();

  // 2. Create Centres (2 centres: Kota & Jaipur)
  const centreKota = await prisma.centre.create({
    data: {
      id: "centre_kota_01",
      name: "Tracky Kota Main Campus",
      city: "Kota",
      gstin: "08AAAAA0000A1Z5",
    },
  });

  const centreJaipur = await prisma.centre.create({
    data: {
      id: "centre_jaipur_01",
      name: "Tracky Jaipur Campus",
      city: "Jaipur",
      gstin: "08BBBBB0000B1Z6",
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
        centreId: centreKota.id,
      },
      {
        id: "usr_accounts_01",
        name: "Neha Verma (Accounts Lead)",
        email: "accounts@tracky.edu",
        passwordHash: defaultStaffHash,
        role: "ACCOUNTS",
        centreId: centreKota.id,
      },
      {
        id: "usr_counsellor_01",
        name: "Dr. Rajesh K (Senior Counsellor - Kota)",
        email: "counsellor@tracky.edu",
        passwordHash: defaultStaffHash,
        role: "COUNSELLOR",
        centreId: centreKota.id,
      },
      {
        id: "usr_counsellor_02",
        name: "Anjali Nair (Student Counsellor - Jaipur)",
        email: "counsellor.jaipur@tracky.edu",
        passwordHash: defaultStaffHash,
        role: "COUNSELLOR",
        centreId: centreJaipur.id,
      },
    ],
  });

  // 4. Create 4 Academic Batches
  const batchJee2027 = await prisma.batch.create({
    data: {
      id: "batch_jee_2027",
      centreId: centreKota.id,
      name: "JEE Advanced 2027 Foundation Cohort",
      courseStart: new Date("2026-06-01T00:00:00.000Z"),
      courseEnd: new Date("2027-05-31T23:59:59.000Z"),
    },
  });

  const batchNeet2027 = await prisma.batch.create({
    data: {
      id: "batch_neet_2027",
      centreId: centreKota.id,
      name: "NEET 2027 Medical Achievers Cohort",
      courseStart: new Date("2026-06-01T00:00:00.000Z"),
      courseEnd: new Date("2027-05-31T23:59:59.000Z"),
    },
  });

  const batchJee2028 = await prisma.batch.create({
    data: {
      id: "batch_jee_2028",
      centreId: centreJaipur.id,
      name: "JEE 2028 Two-Year Premier Batch",
      courseStart: new Date("2026-07-01T00:00:00.000Z"),
      courseEnd: new Date("2028-05-31T23:59:59.000Z"),
    },
  });

  const batchFoundation2027 = await prisma.batch.create({
    data: {
      id: "batch_foundation_2027",
      centreId: centreKota.id,
      name: "Class 10 Foundation & Olympiad Cohort",
      courseStart: new Date("2026-05-01T00:00:00.000Z"),
      courseEnd: new Date("2027-03-31T23:59:59.000Z"),
    },
  });

  // 5. Create Fee Plans
  // Plan 1: JEE 2027 - ₹30,000 total (2 instalments of ₹15,000)
  const planJee2027 = await prisma.feePlan.create({
    data: {
      id: "plan_jee_2027",
      batchId: batchJee2027.id,
      name: "JEE 2027 2-Instalment Plan",
      totalPaise: BigInt(3000000), // ₹30,000
      registrationPaise: BigInt(500000), // ₹5,000
      instalmentCount: 2,
    },
  });

  // Plan 2: NEET 2027 - ₹20,000 total (2 instalments of ₹10,000)
  const planNeet2027 = await prisma.feePlan.create({
    data: {
      id: "plan_neet_2027",
      batchId: batchNeet2027.id,
      name: "NEET 2027 2-Instalment Plan",
      totalPaise: BigInt(2000000), // ₹20,000
      registrationPaise: BigInt(500000), // ₹5,000
      instalmentCount: 2,
    },
  });

  // Plan 3: JEE 2028 Single Instalment - ₹25,000 total (1 instalment of ₹25,000 for STU-0219)
  const planJee2028Single = await prisma.feePlan.create({
    data: {
      id: "plan_jee_2028_single",
      batchId: batchJee2028.id,
      name: "JEE 2028 Single Instalment Plan",
      totalPaise: BigInt(2500000), // ₹25,000
      registrationPaise: BigInt(500000), // ₹5,000
      instalmentCount: 1,
    },
  });

  // Plan 4: JEE 2028 - ₹50,000 total (2 instalments of ₹25,000)
  const planJee2028 = await prisma.feePlan.create({
    data: {
      id: "plan_jee_2028",
      batchId: batchJee2028.id,
      name: "JEE 2028 2-Instalment Plan",
      totalPaise: BigInt(5000000), // ₹50,000
      registrationPaise: BigInt(1000000), // ₹10,000
      instalmentCount: 2,
    },
  });

  // Plan 5: Foundation 2027 - ₹24,000 total (2 instalments of ₹12,000)
  const planFoundation2027 = await prisma.feePlan.create({
    data: {
      id: "plan_foundation_2027",
      batchId: batchFoundation2027.id,
      name: "Foundation 2027 2-Instalment Plan",
      totalPaise: BigInt(2400000), // ₹24,000
      registrationPaise: BigInt(400000), // ₹4,000
      instalmentCount: 2,
    },
  });

  // 6. Default Versioned Refund Policy
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

  let kotaReceiptSeq = 1;
  let jaipurReceiptSeq = 1;

  function nextReceiptNo(centreCode: "KOT" | "JAI"): string {
    if (centreCode === "KOT") {
      const num = String(kotaReceiptSeq++).padStart(4, "0");
      return `RCP-2026-KOT-${num}`;
    } else {
      const num = String(jaipurReceiptSeq++).padStart(4, "0");
      return `RCP-2026-JAI-${num}`;
    }
  }

  // =========================================================================
  // 7. Benchmark Student 1: STU-0587 (Aarav Sharma)
  // Brief: ₹30,000 due 2026-10-10, ₹15,000 paid, as of 2026-11-02 → balance ₹15,000, 23 days overdue.
  // =========================================================================
  const stu0587 = await prisma.student.create({
    data: {
      id: "STU-0587",
      name: "Aarav Sharma",
      batchId: batchJee2027.id,
      dateOfBirth: new Date("2009-08-15T00:00:00.000Z"),
      status: "ACTIVE",
    },
  });

  const grd0587 = await prisma.guardian.create({
    data: {
      id: "grd_stu_0587",
      studentId: stu0587.id,
      name: "Rajesh Sharma",
      phone: "+919876543210",
      email: "rajesh.sharma@example.com",
      relation: "FATHER",
      preferredLang: "HI",
    },
  });

  await prisma.consent.create({
    data: {
      id: "cns_stu_0587",
      guardianId: grd0587.id,
      studentId: stu0587.id,
      noticeVersion: "v2026.1",
      ipAddress: "49.36.128.45",
      grantedAt: new Date("2026-06-02T10:30:00.000Z"),
    },
  });

  const enr0587 = await prisma.enrollment.create({
    data: {
      id: "enr_stu_0587",
      studentId: stu0587.id,
      planId: planJee2027.id,
      discountPaise: BigInt(0),
      enrolledAt: new Date("2026-06-02T10:30:00.000Z"),
    },
  });

  const inst0587Seq1 = await prisma.instalment.create({
    data: {
      id: "inst_0587_1",
      enrollmentId: enr0587.id,
      seq: 1,
      amountPaise: BigInt(1500000), // ₹15,000
      dueDate: new Date("2026-08-10T00:00:00.000Z"),
      graceDays: 3,
    },
  });

  const inst0587Seq2 = await prisma.instalment.create({
    data: {
      id: "inst_0587_2",
      enrollmentId: enr0587.id,
      seq: 2,
      amountPaise: BigInt(1500000), // ₹15,000
      dueDate: new Date("2026-10-10T00:00:00.000Z"), // 23 days overdue on 2026-11-02
      graceDays: 3,
    },
  });

  await prisma.paymentOrder.create({
    data: {
      id: "ord_0587_1",
      instalmentId: inst0587Seq1.id,
      guardianId: grd0587.id,
      amountPaise: BigInt(1500000),
      gatewayOrderId: "order_mock_aarav_001",
      status: "PAID",
      createdAt: new Date("2026-08-08T14:20:00.000Z"),
    },
  });

  const pay0587 = await prisma.payment.create({
    data: {
      id: "pay_0587_1",
      studentId: stu0587.id,
      amountPaise: BigInt(1500000),
      source: "ONLINE_GATEWAY",
      gatewayRef: "pay_mock_gateway_aarav_001",
      receivedAt: new Date("2026-08-08T14:22:10.000Z"),
      status: "MATCHED",
      notes: "Online UPI payment via Mock Gateway (Instalment 1)",
    },
  });

  await prisma.allocation.create({
    data: {
      id: "alloc_0587_1",
      paymentId: pay0587.id,
      instalmentId: inst0587Seq1.id,
      amountPaise: BigInt(1500000),
    },
  });

  await prisma.receipt.create({
    data: {
      id: "rcp_0587_1",
      paymentId: pay0587.id,
      receiptNo: nextReceiptNo("KOT"),
      gstin: centreKota.gstin!,
      taxablePaise: BigInt(1271186),
      gstPaise: BigInt(228814),
      issuedAt: new Date("2026-08-08T14:22:15.000Z"),
    },
  });

  await prisma.reminder.createMany({
    data: [
      {
        id: "rem_0587_t_minus_3",
        instalmentId: inst0587Seq2.id,
        templateKey: "T_MINUS_3",
        scheduledFor: new Date("2026-10-07T09:00:00.000Z"),
        sentAt: new Date("2026-10-07T09:05:12.000Z"),
        status: "SENT",
        channel: "WHATSAPP",
        responseLog: "Delivered: msg_id_mock_001",
      },
      {
        id: "rem_0587_t_zero",
        instalmentId: inst0587Seq2.id,
        templateKey: "T_ZERO",
        scheduledFor: new Date("2026-10-10T09:00:00.000Z"),
        sentAt: new Date("2026-10-10T09:04:48.000Z"),
        status: "SENT",
        channel: "WHATSAPP",
        responseLog: "Delivered: msg_id_mock_002",
      },
      {
        id: "rem_0587_t_plus_3",
        instalmentId: inst0587Seq2.id,
        templateKey: "T_PLUS_3",
        scheduledFor: new Date("2026-10-13T09:00:00.000Z"),
        sentAt: new Date("2026-10-13T09:03:22.000Z"),
        status: "SENT",
        channel: "WHATSAPP",
        responseLog: "Delivered: msg_id_mock_003",
      },
      {
        id: "rem_0587_t_plus_7",
        instalmentId: inst0587Seq2.id,
        templateKey: "T_PLUS_7",
        scheduledFor: new Date("2026-10-17T09:00:00.000Z"),
        sentAt: new Date("2026-10-17T09:02:10.000Z"),
        status: "SENT",
        channel: "WHATSAPP",
        responseLog: "Delivered: msg_id_mock_004",
      },
    ],
  });

  await prisma.attendanceRecord.createMany({
    data: [
      { id: "att_0587_1", studentId: stu0587.id, date: new Date("2026-10-01T00:00:00.000Z"), present: true },
      { id: "att_0587_2", studentId: stu0587.id, date: new Date("2026-10-02T00:00:00.000Z"), present: true },
      { id: "att_0587_3", studentId: stu0587.id, date: new Date("2026-10-03T00:00:00.000Z"), present: false },
      { id: "att_0587_4", studentId: stu0587.id, date: new Date("2026-10-04T00:00:00.000Z"), present: false },
    ],
  });

  await prisma.testScore.createMany({
    data: [
      {
        id: "score_0587_1",
        studentId: stu0587.id,
        testName: "Physics Weekly Test 1",
        date: new Date("2026-09-15T00:00:00.000Z"),
        score: 85,
        maxScore: 100,
      },
      {
        id: "score_0587_2",
        studentId: stu0587.id,
        testName: "Math Midterm 1",
        date: new Date("2026-10-15T00:00:00.000Z"),
        score: 62,
        maxScore: 100,
      },
    ],
  });

  // =========================================================================
  // 8. Benchmark Student 2: STU-0412 (Priya Patel)
  // Brief: fully paid → 0 days overdue, balance 0.
  // =========================================================================
  const stu0412 = await prisma.student.create({
    data: {
      id: "STU-0412",
      name: "Priya Patel",
      batchId: batchNeet2027.id,
      dateOfBirth: new Date("2009-03-22T00:00:00.000Z"),
      status: "ACTIVE",
    },
  });

  const grd0412 = await prisma.guardian.create({
    data: {
      id: "grd_stu_0412",
      studentId: stu0412.id,
      name: "Suresh Patel",
      phone: "+919876543211",
      email: "suresh.patel@example.com",
      relation: "FATHER",
      preferredLang: "EN",
    },
  });

  await prisma.consent.create({
    data: {
      id: "cns_stu_0412",
      guardianId: grd0412.id,
      studentId: stu0412.id,
      noticeVersion: "v2026.1",
      ipAddress: "49.36.128.46",
      grantedAt: new Date("2026-06-05T09:00:00.000Z"),
    },
  });

  const enr0412 = await prisma.enrollment.create({
    data: {
      id: "enr_stu_0412",
      studentId: stu0412.id,
      planId: planNeet2027.id,
      discountPaise: BigInt(0),
      enrolledAt: new Date("2026-06-05T09:00:00.000Z"),
    },
  });

  const inst0412Seq1 = await prisma.instalment.create({
    data: {
      id: "inst_0412_1",
      enrollmentId: enr0412.id,
      seq: 1,
      amountPaise: BigInt(1000000), // ₹10,000
      dueDate: new Date("2026-07-01T00:00:00.000Z"),
      graceDays: 3,
    },
  });

  const inst0412Seq2 = await prisma.instalment.create({
    data: {
      id: "inst_0412_2",
      enrollmentId: enr0412.id,
      seq: 2,
      amountPaise: BigInt(1000000), // ₹10,000
      dueDate: new Date("2026-09-01T00:00:00.000Z"),
      graceDays: 3,
    },
  });

  // Payment 1 for STU-0412
  const pay0412_1 = await prisma.payment.create({
    data: {
      id: "pay_0412_1",
      studentId: stu0412.id,
      amountPaise: BigInt(1000000),
      source: "ONLINE_GATEWAY",
      gatewayRef: "pay_mock_gateway_priya_001",
      receivedAt: new Date("2026-06-28T11:00:00.000Z"),
      status: "MATCHED",
      notes: "Instalment 1 payment for Priya Patel",
    },
  });

  await prisma.allocation.create({
    data: {
      id: "alloc_0412_1",
      paymentId: pay0412_1.id,
      instalmentId: inst0412Seq1.id,
      amountPaise: BigInt(1000000),
    },
  });

  await prisma.receipt.create({
    data: {
      id: "rcp_0412_1",
      paymentId: pay0412_1.id,
      receiptNo: nextReceiptNo("KOT"),
      gstin: centreKota.gstin!,
      taxablePaise: BigInt(847458),
      gstPaise: BigInt(152542),
      issuedAt: new Date("2026-06-28T11:00:05.000Z"),
    },
  });

  // Payment 2 for STU-0412
  const pay0412_2 = await prisma.payment.create({
    data: {
      id: "pay_0412_2",
      studentId: stu0412.id,
      amountPaise: BigInt(1000000),
      source: "BANK_TRANSFER",
      gatewayRef: "pay_mock_neft_priya_002",
      receivedAt: new Date("2026-08-30T16:15:00.000Z"),
      status: "MATCHED",
      notes: "Instalment 2 NEFT payment for Priya Patel",
    },
  });

  await prisma.allocation.create({
    data: {
      id: "alloc_0412_2",
      paymentId: pay0412_2.id,
      instalmentId: inst0412Seq2.id,
      amountPaise: BigInt(1000000),
    },
  });

  await prisma.receipt.create({
    data: {
      id: "rcp_0412_2",
      paymentId: pay0412_2.id,
      receiptNo: nextReceiptNo("KOT"),
      gstin: centreKota.gstin!,
      taxablePaise: BigInt(847458),
      gstPaise: BigInt(152542),
      issuedAt: new Date("2026-08-30T16:15:05.000Z"),
    },
  });

  await prisma.attendanceRecord.createMany({
    data: [
      { id: "att_0412_1", studentId: stu0412.id, date: new Date("2026-10-01T00:00:00.000Z"), present: true },
      { id: "att_0412_2", studentId: stu0412.id, date: new Date("2026-10-02T00:00:00.000Z"), present: true },
      { id: "att_0412_3", studentId: stu0412.id, date: new Date("2026-10-03T00:00:00.000Z"), present: true },
      { id: "att_0412_4", studentId: stu0412.id, date: new Date("2026-10-04T00:00:00.000Z"), present: true },
    ],
  });

  await prisma.testScore.createMany({
    data: [
      {
        id: "score_0412_1",
        studentId: stu0412.id,
        testName: "Biology Midterm",
        date: new Date("2026-09-20T00:00:00.000Z"),
        score: 96,
        maxScore: 100,
      },
    ],
  });

  // =========================================================================
  // 9. Benchmark Student 3: STU-0219 (Rohan Gupta)
  // Brief: due 2026-11-15, as of 2026-11-02 → not overdue.
  // =========================================================================
  const stu0219 = await prisma.student.create({
    data: {
      id: "STU-0219",
      name: "Rohan Gupta",
      batchId: batchJee2028.id,
      dateOfBirth: new Date("2010-01-10T00:00:00.000Z"),
      status: "ACTIVE",
    },
  });

  const grd0219 = await prisma.guardian.create({
    data: {
      id: "grd_stu_0219",
      studentId: stu0219.id,
      name: "Anil Gupta",
      phone: "+919876543212",
      email: "anil.gupta@example.com",
      relation: "FATHER",
      preferredLang: "EN",
    },
  });

  await prisma.consent.create({
    data: {
      id: "cns_stu_0219",
      guardianId: grd0219.id,
      studentId: stu0219.id,
      noticeVersion: "v2026.1",
      ipAddress: "49.36.128.47",
      grantedAt: new Date("2026-07-01T10:00:00.000Z"),
    },
  });

  const enr0219 = await prisma.enrollment.create({
    data: {
      id: "enr_stu_0219",
      studentId: stu0219.id,
      planId: planJee2028Single.id,
      discountPaise: BigInt(0),
      enrolledAt: new Date("2026-07-01T10:00:00.000Z"),
    },
  });

  await prisma.instalment.create({
    data: {
      id: "inst_0219_1",
      enrollmentId: enr0219.id,
      seq: 1,
      amountPaise: BigInt(2500000), // ₹25,000
      dueDate: new Date("2026-11-15T00:00:00.000Z"), // Future date as of 2026-11-02!
      graceDays: 3,
    },
  });

  await prisma.attendanceRecord.createMany({
    data: [
      { id: "att_0219_1", studentId: stu0219.id, date: new Date("2026-10-01T00:00:00.000Z"), present: true },
      { id: "att_0219_2", studentId: stu0219.id, date: new Date("2026-10-02T00:00:00.000Z"), present: true },
    ],
  });

  await prisma.testScore.createMany({
    data: [
      {
        id: "score_0219_1",
        studentId: stu0219.id,
        testName: "Foundation Diagnostic",
        date: new Date("2026-08-10T00:00:00.000Z"),
        score: 78,
        maxScore: 100,
      },
    ],
  });

  // =========================================================================
  // 10. Generate 60 Additional Students across the 4 Batches (15 per batch)
  // STU-0001 through STU-0060
  // =========================================================================
  console.log("Generating 60 additional students across 4 batches with realistic ledger profiles...");

  const batchesConfig = [
    {
      batch: batchJee2027,
      feePlan: planJee2027,
      centre: centreKota,
      centreCode: "KOT" as const,
      instalmentAmountRupee: 15000,
      studentRange: [1, 15] as const,
    },
    {
      batch: batchNeet2027,
      feePlan: planNeet2027,
      centre: centreKota,
      centreCode: "KOT" as const,
      instalmentAmountRupee: 10000,
      studentRange: [16, 30] as const,
    },
    {
      batch: batchJee2028,
      feePlan: planJee2028,
      centre: centreJaipur,
      centreCode: "JAI" as const,
      instalmentAmountRupee: 25000,
      studentRange: [31, 45] as const,
    },
    {
      batch: batchFoundation2027,
      feePlan: planFoundation2027,
      centre: centreKota,
      centreCode: "KOT" as const,
      instalmentAmountRupee: 12000,
      studentRange: [46, 60] as const,
    },
  ];

  // Bulk collectors for fast insertion
  const studentsToInsert: Prisma.StudentCreateManyInput[] = [];
  const guardiansToInsert: Prisma.GuardianCreateManyInput[] = [];
  const consentsToInsert: Prisma.ConsentCreateManyInput[] = [];
  const enrollmentsToInsert: Prisma.EnrollmentCreateManyInput[] = [];
  const instalmentsToInsert: Prisma.InstalmentCreateManyInput[] = [];
  const paymentOrdersToInsert: Prisma.PaymentOrderCreateManyInput[] = [];
  const paymentsToInsert: Prisma.PaymentCreateManyInput[] = [];
  const allocationsToInsert: Prisma.AllocationCreateManyInput[] = [];
  const receiptsToInsert: Prisma.ReceiptCreateManyInput[] = [];
  const remindersToInsert: Prisma.ReminderCreateManyInput[] = [];
  const attendanceToInsert: Prisma.AttendanceRecordCreateManyInput[] = [];
  const testScoresToInsert: Prisma.TestScoreCreateManyInput[] = [];
  const riskFlagsToInsert: Prisma.RiskFlagCreateManyInput[] = [];
  const counsellorTasksToInsert: Prisma.CounsellorTaskCreateManyInput[] = [];

  let paymentCounter = 100;
  let orderCounter = 100;

  for (const cfg of batchesConfig) {
    const [startIdx, endIdx] = cfg.studentRange;
    const batchSize = endIdx - startIdx + 1; // 15 students

    for (let i = 0; i < batchSize; i++) {
      const studentNum = startIdx + i;
      const studentId = `STU-${String(studentNum).padStart(4, "0")}`;

      const firstName = FIRST_NAMES[(studentNum * 7) % FIRST_NAMES.length];
      const lastName = LAST_NAMES[(studentNum * 11) % LAST_NAMES.length];
      const studentName = `${firstName} ${lastName}`;

      // Guardian details
      const parentPrefix = PARENT_PREFIXES[(studentNum * 3) % PARENT_PREFIXES.length];
      const guardianName = `${parentPrefix}${firstName} ${lastName}`;
      const guardianId = `grd_${studentId.toLowerCase()}`;
      const phone = `+91981000${String(studentNum).padStart(4, "0")}`;
      const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${studentNum}@example.com`;
      const preferredLang = studentNum % 3 === 0 ? "HI" : "EN";

      // Exit/Dropout demonstration for STU-0060
      const isLeft = studentNum === 60;
      const studentStatus = isLeft ? "LEFT" : "ACTIVE";
      const leftDate = isLeft ? new Date("2026-09-15T00:00:00.000Z") : null;

      studentsToInsert.push({
        id: studentId,
        name: studentName,
        batchId: cfg.batch.id,
        dateOfBirth: new Date(`2009-${String((studentNum % 12) + 1).padStart(2, "0")}-15T00:00:00.000Z`),
        status: studentStatus,
        leftOn: leftDate,
      });

      guardiansToInsert.push({
        id: guardianId,
        studentId: studentId,
        name: guardianName,
        phone: phone,
        email: email,
        relation: studentNum % 2 === 0 ? "FATHER" : "MOTHER",
        preferredLang: preferredLang,
      });

      consentsToInsert.push({
        id: `cns_${studentId.toLowerCase()}`,
        guardianId: guardianId,
        studentId: studentId,
        noticeVersion: "v2026.1",
        ipAddress: `49.36.${100 + (studentNum % 50)}.${10 + (studentNum % 200)}`,
        grantedAt: new Date("2026-06-01T10:00:00.000Z"),
      });

      const enrollmentId = `enr_${studentId.toLowerCase()}`;
      enrollmentsToInsert.push({
        id: enrollmentId,
        studentId: studentId,
        planId: cfg.feePlan.id,
        discountPaise: BigInt(0),
        enrolledAt: new Date("2026-06-01T10:00:00.000Z"),
      });

      // Scheduled instalments for this student
      const instAmountPaise = BigInt(cfg.instalmentAmountRupee * 100);
      const inst1Id = `inst_${studentId.toLowerCase()}_1`;
      const inst2Id = `inst_${studentId.toLowerCase()}_2`;

      // Assign due dates:
      // Inst 1: July / August
      // Inst 2: September / October
      const inst1DueDate = new Date("2026-07-20T00:00:00.000Z");
      const inst2DueDate =
        i < 6
          ? new Date("2026-09-20T00:00:00.000Z")
          : i < 10
            ? new Date("2026-10-15T00:00:00.000Z") // 18 days overdue on 2026-11-02
            : i < 13
              ? new Date("2026-09-10T00:00:00.000Z") // 53 days overdue on 2026-11-02
              : new Date("2026-08-15T00:00:00.000Z"); // Inst 2 due Aug 15 -> 79 days overdue

      instalmentsToInsert.push({
        id: inst1Id,
        enrollmentId: enrollmentId,
        seq: 1,
        amountPaise: instAmountPaise,
        dueDate: i < 13 ? inst1DueDate : new Date("2026-08-01T00:00:00.000Z"),
        graceDays: 3,
      });

      instalmentsToInsert.push({
        id: inst2Id,
        enrollmentId: enrollmentId,
        seq: 2,
        amountPaise: instAmountPaise,
        dueDate: inst2DueDate,
        graceDays: 3,
      });

      // Distribution of ledger profiles:
      // i = 0..5 (6 students, 40%): Fully Paid
      // i = 6..9 (4 students, ~27%): On Track / Mild Overdue (0-30 days)
      // i = 10..12 (3 students, 20%): Moderately Overdue (31-60 days)
      // i = 13..14 (2 students, ~13%): Severely Overdue (60+ days)

      if (i < 6) {
        // --- FULLY PAID ---
        // Payment 1
        const pay1Id = `pay_${studentId.toLowerCase()}_1`;
        const order1Id = `ord_${studentId.toLowerCase()}_1`;
        paymentOrdersToInsert.push({
          id: order1Id,
          instalmentId: inst1Id,
          guardianId: guardianId,
          amountPaise: instAmountPaise,
          gatewayOrderId: `gw_ord_${++orderCounter}`,
          status: "PAID",
          createdAt: new Date("2026-07-18T10:00:00.000Z"),
        });

        paymentsToInsert.push({
          id: pay1Id,
          studentId: studentId,
          amountPaise: instAmountPaise,
          source: studentNum % 2 === 0 ? "ONLINE_GATEWAY" : "UPI_DIRECT",
          gatewayRef: `gw_ref_${++paymentCounter}`,
          receivedAt: new Date("2026-07-18T10:05:00.000Z"),
          status: "MATCHED",
          notes: "Instalment 1 payment",
        });

        allocationsToInsert.push({
          id: `alloc_${studentId.toLowerCase()}_1`,
          paymentId: pay1Id,
          instalmentId: inst1Id,
          amountPaise: instAmountPaise,
        });

        const taxable1 = BigInt(Math.round(Number(instAmountPaise) / 1.18));
        receiptsToInsert.push({
          id: `rcp_${studentId.toLowerCase()}_1`,
          paymentId: pay1Id,
          receiptNo: nextReceiptNo(cfg.centreCode),
          gstin: cfg.centre.gstin!,
          taxablePaise: taxable1,
          gstPaise: instAmountPaise - taxable1,
          issuedAt: new Date("2026-07-18T10:05:05.000Z"),
        });

        // Payment 2
        const pay2Id = `pay_${studentId.toLowerCase()}_2`;
        const order2Id = `ord_${studentId.toLowerCase()}_2`;
        paymentOrdersToInsert.push({
          id: order2Id,
          instalmentId: inst2Id,
          guardianId: guardianId,
          amountPaise: instAmountPaise,
          gatewayOrderId: `gw_ord_${++orderCounter}`,
          status: "PAID",
          createdAt: new Date("2026-09-18T11:00:00.000Z"),
        });

        paymentsToInsert.push({
          id: pay2Id,
          studentId: studentId,
          amountPaise: instAmountPaise,
          source: "ONLINE_GATEWAY",
          gatewayRef: `gw_ref_${++paymentCounter}`,
          receivedAt: new Date("2026-09-18T11:04:00.000Z"),
          status: "MATCHED",
          notes: "Instalment 2 payment",
        });

        allocationsToInsert.push({
          id: `alloc_${studentId.toLowerCase()}_2`,
          paymentId: pay2Id,
          instalmentId: inst2Id,
          amountPaise: instAmountPaise,
        });

        const taxable2 = BigInt(Math.round(Number(instAmountPaise) / 1.18));
        receiptsToInsert.push({
          id: `rcp_${studentId.toLowerCase()}_2`,
          paymentId: pay2Id,
          receiptNo: nextReceiptNo(cfg.centreCode),
          gstin: cfg.centre.gstin!,
          taxablePaise: taxable2,
          gstPaise: instAmountPaise - taxable2,
          issuedAt: new Date("2026-09-18T11:04:05.000Z"),
        });
      } else if (i < 10) {
        // --- ON TRACK / MILD OVERDUE (Instalment 1 paid, Instalment 2 due Oct, overdue ~18 days) ---
        const pay1Id = `pay_${studentId.toLowerCase()}_1`;
        const order1Id = `ord_${studentId.toLowerCase()}_1`;
        paymentOrdersToInsert.push({
          id: order1Id,
          instalmentId: inst1Id,
          guardianId: guardianId,
          amountPaise: instAmountPaise,
          gatewayOrderId: `gw_ord_${++orderCounter}`,
          status: "PAID",
          createdAt: new Date("2026-07-19T14:00:00.000Z"),
        });

        paymentsToInsert.push({
          id: pay1Id,
          studentId: studentId,
          amountPaise: instAmountPaise,
          source: "ONLINE_GATEWAY",
          gatewayRef: `gw_ref_${++paymentCounter}`,
          receivedAt: new Date("2026-07-19T14:05:00.000Z"),
          status: "MATCHED",
          notes: "Instalment 1 on-time payment",
        });

        allocationsToInsert.push({
          id: `alloc_${studentId.toLowerCase()}_1`,
          paymentId: pay1Id,
          instalmentId: inst1Id,
          amountPaise: instAmountPaise,
        });

        const taxable1 = BigInt(Math.round(Number(instAmountPaise) / 1.18));
        receiptsToInsert.push({
          id: `rcp_${studentId.toLowerCase()}_1`,
          paymentId: pay1Id,
          receiptNo: nextReceiptNo(cfg.centreCode),
          gstin: cfg.centre.gstin!,
          taxablePaise: taxable1,
          gstPaise: instAmountPaise - taxable1,
          issuedAt: new Date("2026-07-19T14:05:05.000Z"),
        });

        // Reminders for Inst 2
        remindersToInsert.push(
          {
            id: `rem_${studentId.toLowerCase()}_t_minus_3`,
            instalmentId: inst2Id,
            templateKey: "T_MINUS_3",
            scheduledFor: new Date("2026-10-12T09:00:00.000Z"),
            sentAt: new Date("2026-10-12T09:04:00.000Z"),
            status: "SENT",
            channel: "WHATSAPP",
            responseLog: "Delivered",
          },
          {
            id: `rem_${studentId.toLowerCase()}_t_zero`,
            instalmentId: inst2Id,
            templateKey: "T_ZERO",
            scheduledFor: new Date("2026-10-15T09:00:00.000Z"),
            sentAt: new Date("2026-10-15T09:03:00.000Z"),
            status: "SENT",
            channel: "WHATSAPP",
            responseLog: "Delivered",
          },
          {
            id: `rem_${studentId.toLowerCase()}_t_plus_3`,
            instalmentId: inst2Id,
            templateKey: "T_PLUS_3",
            scheduledFor: new Date("2026-10-18T09:00:00.000Z"),
            sentAt: new Date("2026-10-18T09:05:00.000Z"),
            status: "SENT",
            channel: "WHATSAPP",
            responseLog: "Delivered",
          }
        );
      } else if (i < 13) {
        // --- MODERATELY OVERDUE (31-60 days: Inst 1 paid, Inst 2 due Sep 10 -> 53 days overdue) ---
        const pay1Id = `pay_${studentId.toLowerCase()}_1`;
        const order1Id = `ord_${studentId.toLowerCase()}_1`;
        paymentOrdersToInsert.push({
          id: order1Id,
          instalmentId: inst1Id,
          guardianId: guardianId,
          amountPaise: instAmountPaise,
          gatewayOrderId: `gw_ord_${++orderCounter}`,
          status: "PAID",
          createdAt: new Date("2026-07-20T10:00:00.000Z"),
        });

        paymentsToInsert.push({
          id: pay1Id,
          studentId: studentId,
          amountPaise: instAmountPaise,
          source: "BANK_TRANSFER",
          gatewayRef: `gw_ref_${++paymentCounter}`,
          receivedAt: new Date("2026-07-20T10:05:00.000Z"),
          status: "MATCHED",
          notes: "Instalment 1 bank transfer",
        });

        allocationsToInsert.push({
          id: `alloc_${studentId.toLowerCase()}_1`,
          paymentId: pay1Id,
          instalmentId: inst1Id,
          amountPaise: instAmountPaise,
        });

        const taxable1 = BigInt(Math.round(Number(instAmountPaise) / 1.18));
        receiptsToInsert.push({
          id: `rcp_${studentId.toLowerCase()}_1`,
          paymentId: pay1Id,
          receiptNo: nextReceiptNo(cfg.centreCode),
          gstin: cfg.centre.gstin!,
          taxablePaise: taxable1,
          gstPaise: instAmountPaise - taxable1,
          issuedAt: new Date("2026-07-20T10:05:05.000Z"),
        });

        // Reminders for Inst 2
        remindersToInsert.push(
          {
            id: `rem_${studentId.toLowerCase()}_t_zero`,
            instalmentId: inst2Id,
            templateKey: "T_ZERO",
            scheduledFor: new Date("2026-09-10T09:00:00.000Z"),
            sentAt: new Date("2026-09-10T09:02:00.000Z"),
            status: "SENT",
            channel: "WHATSAPP",
            responseLog: "Delivered",
          },
          {
            id: `rem_${studentId.toLowerCase()}_t_plus_7`,
            instalmentId: inst2Id,
            templateKey: "T_PLUS_7",
            scheduledFor: new Date("2026-09-17T09:00:00.000Z"),
            sentAt: new Date("2026-09-17T09:02:00.000Z"),
            status: "SENT",
            channel: "WHATSAPP",
            responseLog: "Delivered",
          },
          {
            id: `rem_${studentId.toLowerCase()}_t_plus_14`,
            instalmentId: inst2Id,
            templateKey: "T_PLUS_14",
            scheduledFor: new Date("2026-09-24T09:00:00.000Z"),
            sentAt: new Date("2026-09-24T09:02:00.000Z"),
            status: "SENT",
            channel: "WHATSAPP",
            responseLog: "Delivered",
          }
        );

        // Risk flag & Counsellor task
        const flagId = `risk_${studentId.toLowerCase()}`;
        riskFlagsToInsert.push({
          id: flagId,
          studentId: studentId,
          score: 65,
          reasonsJson: ["Instalment 2 overdue > 45 days", "Reminder T+14 unacknowledged"],
          status: "OPEN",
        });

        counsellorTasksToInsert.push({
          id: `task_${studentId.toLowerCase()}`,
          studentId: studentId,
          flagId: flagId,
          assigneeId: cfg.centreCode === "KOT" ? "usr_counsellor_01" : "usr_counsellor_02",
          dueDate: new Date("2026-11-05T00:00:00.000Z"),
          status: "OPEN",
          notes: `Follow up on overdue instalment 2 (₹${cfg.instalmentAmountRupee})`,
        });
      } else {
        // --- SEVERELY OVERDUE (60+ days: Neither instalment paid, Inst 1 due Aug 1 -> 93 days overdue) ---
        remindersToInsert.push(
          {
            id: `rem_${studentId.toLowerCase()}_t_zero`,
            instalmentId: inst1Id,
            templateKey: "T_ZERO",
            scheduledFor: new Date("2026-08-01T09:00:00.000Z"),
            sentAt: new Date("2026-08-01T09:05:00.000Z"),
            status: "SENT",
            channel: "WHATSAPP",
            responseLog: "Delivered",
          },
          {
            id: `rem_${studentId.toLowerCase()}_t_plus_14`,
            instalmentId: inst1Id,
            templateKey: "T_PLUS_14",
            scheduledFor: new Date("2026-08-15T09:00:00.000Z"),
            sentAt: new Date("2026-08-15T09:02:00.000Z"),
            status: "SENT",
            channel: "WHATSAPP",
            responseLog: "Delivered",
          },
          {
            id: `rem_${studentId.toLowerCase()}_t_plus_30`,
            instalmentId: inst1Id,
            templateKey: "T_PLUS_30",
            scheduledFor: new Date("2026-08-31T09:00:00.000Z"),
            sentAt: new Date("2026-08-31T09:02:00.000Z"),
            status: "SENT",
            channel: "WHATSAPP",
            responseLog: "Delivered",
          }
        );

        // High Risk flag & Urgent Counsellor task
        const flagId = `risk_${studentId.toLowerCase()}`;
        riskFlagsToInsert.push({
          id: flagId,
          studentId: studentId,
          score: 88,
          reasonsJson: ["Zero payments received", "Instalment 1 overdue > 90 days", "Low attendance"],
          status: "OPEN",
        });

        counsellorTasksToInsert.push({
          id: `task_${studentId.toLowerCase()}`,
          studentId: studentId,
          flagId: flagId,
          assigneeId: cfg.centreCode === "KOT" ? "usr_counsellor_01" : "usr_counsellor_02",
          dueDate: new Date("2026-11-04T00:00:00.000Z"),
          status: "OPEN",
          notes: `Urgent dropout intervention: zero payments and attendance warning for ${studentName}`,
        });
      }

      // Attendance records for October 2026
      const attendanceDates = [
        "2026-10-05", "2026-10-08", "2026-10-12", "2026-10-15", "2026-10-19", "2026-10-22"
      ];
      attendanceDates.forEach((dateStr, dIdx) => {
        // High attendance for fully paid, lower for severely overdue
        const presentThreshold = i < 6 ? 0.9 : i < 10 ? 0.75 : i < 13 ? 0.55 : 0.35;
        const isPresent = rng() < presentThreshold;
        attendanceToInsert.push({
          id: `att_${studentId.toLowerCase()}_${dIdx + 1}`,
          studentId: studentId,
          date: new Date(`${dateStr}T00:00:00.000Z`),
          present: isPresent,
        });
      });

      // Test scores
      testScoresToInsert.push(
        {
          id: `score_${studentId.toLowerCase()}_1`,
          studentId: studentId,
          testName: "Phase 1 Diagnostic Test",
          date: new Date("2026-09-20T00:00:00.000Z"),
          score: randomInt(45, 98),
          maxScore: 100,
        },
        {
          id: `score_${studentId.toLowerCase()}_2`,
          studentId: studentId,
          testName: "Midterm Assessment",
          date: new Date("2026-10-18T00:00:00.000Z"),
          score: randomInt(40, 95),
          maxScore: 100,
        }
      );
    }
  }

  // Batch insert all records using createMany
  console.log(`Inserting ${studentsToInsert.length} students...`);
  await prisma.student.createMany({ data: studentsToInsert });

  console.log(`Inserting ${guardiansToInsert.length} guardians...`);
  await prisma.guardian.createMany({ data: guardiansToInsert });

  console.log(`Inserting ${consentsToInsert.length} consents...`);
  await prisma.consent.createMany({ data: consentsToInsert });

  console.log(`Inserting ${enrollmentsToInsert.length} enrollments...`);
  await prisma.enrollment.createMany({ data: enrollmentsToInsert });

  console.log(`Inserting ${instalmentsToInsert.length} instalments...`);
  await prisma.instalment.createMany({ data: instalmentsToInsert });

  console.log(`Inserting ${paymentOrdersToInsert.length} payment orders...`);
  await prisma.paymentOrder.createMany({ data: paymentOrdersToInsert });

  console.log(`Inserting ${paymentsToInsert.length} payments...`);
  await prisma.payment.createMany({ data: paymentsToInsert });

  console.log(`Inserting ${allocationsToInsert.length} allocations...`);
  await prisma.allocation.createMany({ data: allocationsToInsert });

  console.log(`Inserting ${receiptsToInsert.length} sequential receipts...`);
  await prisma.receipt.createMany({ data: receiptsToInsert });

  console.log(`Inserting ${remindersToInsert.length} reminders...`);
  await prisma.reminder.createMany({ data: remindersToInsert });

  console.log(`Inserting ${attendanceToInsert.length} attendance records...`);
  await prisma.attendanceRecord.createMany({ data: attendanceToInsert });

  console.log(`Inserting ${testScoresToInsert.length} test scores...`);
  await prisma.testScore.createMany({ data: testScoresToInsert });

  console.log(`Inserting ${riskFlagsToInsert.length} risk flags...`);
  await prisma.riskFlag.createMany({ data: riskFlagsToInsert });

  console.log(`Inserting ${counsellorTasksToInsert.length} counsellor tasks...`);
  await prisma.counsellorTask.createMany({ data: counsellorTasksToInsert });

  // 11. Exit Refund Case demonstration for STU-0060 (left student)
  await prisma.refundCase.create({
    data: {
      id: "ref_case_stu_0060",
      enrollmentId: "enr_stu-0060",
      leaveDate: new Date("2026-09-15T00:00:00.000Z"),
      computedPaise: BigInt(800000), // ₹8,000 computed refund
      policyVersion: "v2026.1",
      approvedById: "usr_admin_01",
      settledById: null,
      status: "APPROVED",
      paidByDate: new Date("2026-10-15T00:00:00.000Z"),
      reason: "Relocating out of city",
    },
  });

  // 12. Final immutable Audit Log entry
  await prisma.auditLog.create({
    data: {
      actorId: "usr_admin_01",
      action: "SEED_SYSTEM_DATA",
      entityType: "SYSTEM",
      entityId: "seed_v2",
      beforeState: Prisma.JsonNull,
      afterState: {
        totalStudents: 63,
        benchmarkStudents: ["STU-0587", "STU-0412", "STU-0219"],
        batches: 4,
        centres: 2,
        seedPRNG: 20261103,
      },
    },
  });

  console.log("✅ Seed completed successfully!");
  console.log(`- Centres: 2 (Kota, Jaipur)`);
  console.log(`- Batches: 4`);
  console.log(`- Total Students: 63 (3 benchmarks + 60 cohort students)`);
  console.log(`- Benchmark STU-0587: ₹30,000 fee, ₹15,000 paid, ₹15,000 overdue (23 days)`);
  console.log(`- Benchmark STU-0412: ₹20,000 fee, ₹20,000 paid, ₹0 balance (0 days overdue)`);
  console.log(`- Benchmark STU-0219: ₹25,000 fee, due 2026-11-15, not yet overdue`);
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

await prisma.refundPolicy.upsert({
  where: { version: "v2026.1" },
  update: {},
  create: {
    version: "v2026.1",
    effectiveFrom: new Date("2026-04-01T00:00:00+05:30"),
    rulesJson: { coolingOffDays: 7, registrationRefundable: false, settlementDays: 10 },
  },
});