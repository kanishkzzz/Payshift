import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { PaymentService, PaymentError } from "../services/payment-service";
import { MockGateway } from "../gateways/mock-gateway";
import { RazorpayGateway } from "../gateways/razorpay-gateway";
import { generateSessionToken, hashSessionToken } from "@/lib/auth/session";
import { SubjectType } from "@prisma/client";
import { resetRateLimit } from "@/lib/rate-limit";
import { POST as createOrderRoute } from "@/app/api/parent/instalments/[instalmentId]/pay/route";
import { POST as webhookRoute } from "@/app/api/webhooks/payments/route";
import { GET as getUnmatchedRoute } from "@/app/api/staff/unmatched-payments/route";
import { POST as matchRoute } from "@/app/api/staff/unmatched-payments/[id]/match/route";
import { POST as rejectRoute } from "@/app/api/staff/unmatched-payments/[id]/reject/route";
import { NextRequest } from "next/server";

describe("Tracky Payment Engine & Webhook Architecture", () => {
  let parentSessionToken: string;
  let unauthorizedParentToken: string;
  let accountsStaffToken: string;
  let counsellorStaffToken: string;

  const mockGateway = new MockGateway();

  const cleanupTestRows = async () => {
    // 1. Delete allocations & receipts tied to test payments
    const testPayments = await prisma.payment.findMany({
      where: {
        OR: [
          { gatewayRef: { startsWith: "pay_legit_matched_" } },
          { gatewayRef: { startsWith: "pay_mismatch_" } },
          { gatewayRef: { startsWith: "pay_unknown_gw_ref_" } },
          { gatewayRef: { startsWith: "neft_unmatched_test_" } },
          { gatewayRef: { startsWith: "cash_unmatched_test_" } },
        ],
      },
      select: { id: true },
    });
    const testPaymentIds = testPayments.map((p) => p.id);

    if (testPaymentIds.length > 0) {
      await prisma.receipt.deleteMany({ where: { paymentId: { in: testPaymentIds } } });
      await prisma.allocation.deleteMany({ where: { paymentId: { in: testPaymentIds } } });
      await prisma.payment.deleteMany({ where: { id: { in: testPaymentIds } } });
    }

    // 2. Clean up test payment orders for inst_0587_2
    await prisma.paymentOrder.deleteMany({
      where: { instalmentId: "inst_0587_2" },
    });

    // 3. Reset reminders for inst_0587_2 to SCHEDULED
    await prisma.reminder.updateMany({
      where: { instalmentId: "inst_0587_2" },
      data: { status: "SCHEDULED" },
    });

    // 4. Delete test webhook processed events
    await prisma.processedWebhookEvent.deleteMany({
      where: {
        OR: [
          { eventId: { startsWith: "evt_unknown_order_test_" } },
          { eventId: { startsWith: "evt_mismatch_" } },
          { eventId: { startsWith: "evt_legit_" } },
        ],
      },
    });

    // 5. Delete test audit logs
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { actorId: "SYSTEM_WEBHOOK" },
          { action: "MANUAL_PAYMENT_MATCH" },
          { action: "REJECT_UNMATCHED_PAYMENT" },
        ],
      },
    });
  };

  beforeAll(async () => {
    // Clean up any residual test data before starting
    await cleanupTestRows();

    // 1. Create a test session for benchmark parent (Rajesh Sharma, guardian of STU-0587)
    parentSessionToken = generateSessionToken();
    await prisma.session.create({
      data: {
        subjectType: SubjectType.PARENT,
        subjectId: "grd_stu_0587",
        tokenHash: hashSessionToken(parentSessionToken),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // 2. Create another parent session (guardian of STU-0412, unlinked to STU-0587)
    unauthorizedParentToken = generateSessionToken();
    await prisma.session.create({
      data: {
        subjectType: SubjectType.PARENT,
        subjectId: "grd_stu_0412",
        tokenHash: hashSessionToken(unauthorizedParentToken),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // 3. Create an ACCOUNTS staff session (Neha Verma)
    accountsStaffToken = generateSessionToken();
    await prisma.session.create({
      data: {
        subjectType: SubjectType.STAFF,
        subjectId: "usr_accounts_01",
        tokenHash: hashSessionToken(accountsStaffToken),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // 4. Create a COUNSELLOR staff session (Dr. Rajesh K)
    counsellorStaffToken = generateSessionToken();
    await prisma.session.create({
      data: {
        subjectType: SubjectType.STAFF,
        subjectId: "usr_counsellor_01",
        tokenHash: hashSessionToken(counsellorStaffToken),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  });

  afterAll(async () => {
    await cleanupTestRows();
    await prisma.$disconnect();
  });

  // =========================================================================
  // GATEWAY ADAPTER TESTS
  // =========================================================================
  describe("Payment Gateway Adapters", () => {
    it("MockGateway generates deterministic order IDs and local checkout URL", async () => {
      const order1 = await mockGateway.createOrder({
        orderRef: "inst_test_01",
        amountPaise: BigInt(1500000),
      });

      const order2 = await mockGateway.createOrder({
        orderRef: "inst_test_01",
        amountPaise: BigInt(1500000),
      });

      // Deterministic: same input -> same gateway order ID
      expect(order1.gatewayOrderId).toBe(order2.gatewayOrderId);
      expect(order1.gatewayOrderId).toMatch(/^order_mock_/);
      expect(order1.checkout.provider).toBe("mock");
      const checkoutUrl = order1.checkout.provider === "mock" ? order1.checkout.checkoutUrl : "";
      expect(checkoutUrl).toContain(order1.gatewayOrderId);
      expect(checkoutUrl).toContain("amount=1500000");
    });

    it("MockGateway performs timing-safe signature generation and verification", () => {
      const rawPayload = JSON.stringify({ eventId: "evt_100", amount: 1500000 });
      const validSignature = mockGateway.signPayload(rawPayload);

      expect(mockGateway.verifyWebhook(rawPayload, validSignature)).toBe(true);

      // Tampered payload
      const tamperedPayload = JSON.stringify({ eventId: "evt_100", amount: 2000000 });
      expect(mockGateway.verifyWebhook(tamperedPayload, validSignature)).toBe(false);

      // Invalid signature
      expect(mockGateway.verifyWebhook(rawPayload, "invalid_signature")).toBe(false);
    });

    it("RazorpayGateway performs timing-safe signature comparison", () => {
      process.env.RAZORPAY_WEBHOOK_SECRET = "test_razorpay_secret_123";
      const razorpayGateway = new RazorpayGateway();

      const rawPayload = JSON.stringify({
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_rzp_001",
              order_id: "order_rzp_001",
              amount: 1500000,
            },
          },
        },
      });

      // Compute valid HMAC with matching secret
      const crypto = require("crypto");
      const validSig = crypto
        .createHmac("sha256", "test_razorpay_secret_123")
        .update(rawPayload)
        .digest("hex");

      expect(razorpayGateway.verifyWebhook(rawPayload, validSig)).toBe(true);
      expect(razorpayGateway.verifyWebhook(rawPayload, "tampered_sig")).toBe(false);

      const parsed = razorpayGateway.parseWebhookEvent(rawPayload);
      expect(parsed.gatewayPaymentId).toBe("pay_rzp_001");
      expect(parsed.gatewayOrderId).toBe("order_rzp_001");
      expect(parsed.amountPaise).toBe(BigInt(1500000));
      expect(parsed.status).toBe("PAID");
    });
  });

  // =========================================================================
  // FLOW 1: CREATE ORDER (PARENT TAPS PAY)
  // =========================================================================
  describe("Flow 1: Create Order (POST /api/parent/instalments/[instalmentId]/pay)", () => {
    it("rejects unauthenticated requests with 401", async () => {
      const req = new NextRequest("http://localhost:3000/api/parent/instalments/inst_0587_2/pay", {
        method: "POST",
      });

      const res = await createOrderRoute(req, {
        params: Promise.resolve({ instalmentId: "inst_0587_2" }),
      });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toMatch(/Authentication required/i);
    });

    it("returns 404 (not 403) when an instalment does not belong to the authenticated parent's student", async () => {
      // Guardian of STU-0412 attempts to pay instalment belonging to STU-0587
      const req = new NextRequest("http://localhost:3000/api/parent/instalments/inst_0587_2/pay", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${unauthorizedParentToken}`,
        },
      });

      const res = await createOrderRoute(req, {
        params: Promise.resolve({ instalmentId: "inst_0587_2" }),
      });

      // Must be 404 to avoid leaking existence of instalments across students
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toMatch(/not found/i);
    });

    it("returns clear 'already paid' error (400) if instalment has 0 remaining balance", async () => {
      // inst_0587_1 is already fully paid in seed
      const req = new NextRequest("http://localhost:3000/api/parent/instalments/inst_0587_1/pay", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${parentSessionToken}`,
        },
      });

      const res = await createOrderRoute(req, {
        params: Promise.resolve({ instalmentId: "inst_0587_1" }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.alreadyPaid).toBe(true);
      expect(json.error).toMatch(/already paid in full/i);
    });

    it("creates a PaymentOrder row with status CREATED and amount derived from current balance", async () => {
      resetRateLimit("pay_order:grd_stu_0587");

      const req = new NextRequest("http://localhost:3000/api/parent/instalments/inst_0587_2/pay", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${parentSessionToken}`,
        },
      });

      const res = await createOrderRoute(req, {
        params: Promise.resolve({ instalmentId: "inst_0587_2" }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.gatewayOrderId).toBeDefined();
      expect(json.checkoutUrl).toBeDefined();
      expect(json.amountPaise).toBe("1500000"); // Exactly ₹15,000 balance

      // Verify row created in database
      const dbOrder = await prisma.paymentOrder.findUnique({
        where: { id: json.orderId },
      });
      expect(dbOrder).not.toBeNull();
      expect(dbOrder?.status).toBe("CREATED");
      expect(dbOrder?.amountPaise).toBe(BigInt(1500000));
      expect(dbOrder?.guardianId).toBe("grd_stu_0587");
    });
  });

  // =========================================================================
  // FLOW 2: WEBHOOK PROCESSING (SOURCE OF TRUTH)
  // =========================================================================
  describe("Flow 2: Webhook Processing (POST /api/webhooks/payments)", () => {
    it("rejects invalid signature with 400 before parsing body", async () => {
      const rawPayload = JSON.stringify({ eventId: "evt_invalid", amount: 1500000 });
      const req = new NextRequest("http://localhost:3000/api/webhooks/payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-mock-signature": "bogus_signature_12345",
        },
        body: rawPayload,
      });

      const res = await webhookRoute(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/invalid.*signature/i);
    });

    it("rejects requests missing signature header with 400", async () => {
      const req = new NextRequest("http://localhost:3000/api/webhooks/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const res = await webhookRoute(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/missing webhook signature/i);
    });

    it("routes unknown gatewayOrderId to UNMATCHED queue and returns 200", async () => {
      const uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const payloadObj = {
        eventId: `evt_unknown_order_test_${uniqueId}`,
        type: "payment.captured",
        gatewayOrderId: `order_completely_unknown_${uniqueId}`,
        gatewayPaymentId: `pay_unknown_gw_ref_${uniqueId}`,
        amountPaise: 1500000,
        status: "PAID",
      };
      const rawBody = JSON.stringify(payloadObj);
      const signature = mockGateway.signPayload(rawBody);

      const req = new NextRequest("http://localhost:3000/api/webhooks/payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-mock-signature": signature,
        },
        body: rawBody,
      });

      const res = await webhookRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.unmatched).toBe(true);
      expect(json.reason).toBe("UNKNOWN_ORDER");

      // Verify payment was recorded in UNMATCHED queue
      const unmatchedPayment = await prisma.payment.findUnique({
        where: { gatewayRef: payloadObj.gatewayPaymentId },
      });
      expect(unmatchedPayment).not.toBeNull();
      expect(unmatchedPayment?.status).toBe("UNMATCHED");
      expect(unmatchedPayment?.notes).toMatch(/unknown gatewayOrderId/i);
    });

    it("routes amount mismatch to UNMATCHED queue without allocating and returns 200", async () => {
      // 1. Create a real payment order for ₹15,000 (1500000 paise)
      const order = await PaymentService.createInstalmentPaymentOrder(
        "grd_stu_0587",
        "inst_0587_2"
      );

      // 2. Webhook delivers mismatched amount (e.g. ₹10,000 / 1000000 paise)
      const payloadObj = {
        eventId: `evt_mismatch_${Date.now()}`,
        type: "payment.captured",
        gatewayOrderId: order.gatewayOrderId,
        gatewayPaymentId: `pay_mismatch_${Date.now()}`,
        amountPaise: 1000000, // Expected: 1500000
        status: "PAID",
      };
      const rawBody = JSON.stringify(payloadObj);
      const signature = mockGateway.signPayload(rawBody);

      const req = new NextRequest("http://localhost:3000/api/webhooks/payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-mock-signature": signature,
        },
        body: rawBody,
      });

      const res = await webhookRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.unmatched).toBe(true);
      expect(json.reason).toBe("AMOUNT_MISMATCH");

      // Verify no allocation was created for this payment
      const paymentRecord = await prisma.payment.findUnique({
        where: { gatewayRef: payloadObj.gatewayPaymentId },
        include: { allocations: true },
      });
      expect(paymentRecord?.status).toBe("UNMATCHED");
      expect(paymentRecord?.allocations).toHaveLength(0);
      expect(paymentRecord?.notes).toContain("Amount mismatch");
    });

    it("processes valid matching webhook inside single atomic transaction: allocations, receipts, reminders, and audit log", async () => {
      // 1. Create a fresh order for STU-0587 instalment 2
      const order = await PaymentService.createInstalmentPaymentOrder(
        "grd_stu_0587",
        "inst_0587_2"
      );

      const paymentGatewayRef = `pay_legit_matched_${Date.now()}`;
      const payloadObj = {
        eventId: `evt_legit_${Date.now()}`,
        type: "payment.captured",
        gatewayOrderId: order.gatewayOrderId,
        gatewayPaymentId: paymentGatewayRef,
        amountPaise: 1500000,
        status: "PAID",
      };
      const rawBody = JSON.stringify(payloadObj);
      const signature = mockGateway.signPayload(rawBody);

      const req = new NextRequest("http://localhost:3000/api/webhooks/payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-mock-signature": signature,
        },
        body: rawBody,
      });

      const res = await webhookRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.received).toBe(true);
      expect(json.paymentId).toBeDefined();
      expect(json.receiptNo).toBeDefined();

      // Invariant 1: Payment record created with status MATCHED and source ONLINE_GATEWAY
      const payment = await prisma.payment.findUnique({
        where: { gatewayRef: paymentGatewayRef },
        include: { allocations: true, receipt: true },
      });
      expect(payment).not.toBeNull();
      expect(payment?.status).toBe("MATCHED");
      expect(payment?.source).toBe("ONLINE_GATEWAY");
      expect(payment?.studentId).toBe("STU-0587");

      // Invariant 2: PaymentOrder marked PAID
      const updatedOrder = await prisma.paymentOrder.findUnique({
        where: { id: order.orderId },
      });
      expect(updatedOrder?.status).toBe("PAID");

      // Invariant 3: Allocation created against open instalment
      expect(payment?.allocations).toHaveLength(1);
      expect(payment?.allocations[0].instalmentId).toBe("inst_0587_2");
      expect(payment?.allocations[0].amountPaise).toBe(BigInt(1500000));

      // Invariant 4: Sequential GST receipt created using ReceiptSequence
      expect(payment?.receipt).not.toBeNull();
      expect(payment?.receipt?.receiptNo).toMatch(/^RCP-\d{4}-KOT-\d{4}$/);
      expect(payment?.receipt?.taxablePaise).toBe(BigInt(1271186));
      expect(payment?.receipt?.gstPaise).toBe(BigInt(228814));

      // Invariant 5: SCHEDULED reminders for now fully settled instalment set to SUPPRESSED_PAID
      const reminders = await prisma.reminder.findMany({
        where: { instalmentId: "inst_0587_2" },
      });
      // None of the reminders should remain in SCHEDULED status
      expect(reminders.some((r) => r.status === "SCHEDULED")).toBe(false);

      // Invariant 6: AuditLog written
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          action: "PAYMENT_MATCHED",
          entityId: payment!.id,
        },
      });
      expect(auditLog).not.toBeNull();
      expect(auditLog?.actorId).toBe("SYSTEM_WEBHOOK");

      // =========================================================================
      // IDEMPOTENCY VERIFICATION
      // =========================================================================
      // Sending identical webhook again must be idempotent (return 200 and duplicate: true)
      const duplicateReq = new NextRequest("http://localhost:3000/api/webhooks/payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-mock-signature": signature,
        },
        body: rawBody,
      });
      const duplicateRes = await webhookRoute(duplicateReq);
      expect(duplicateRes.status).toBe(200);
      const duplicateJson = await duplicateRes.json();
      expect(duplicateJson.duplicate).toBe(true);
    });
  });

  // =========================================================================
  // FLOW 3: UNMATCHED PAYMENTS QUEUE (STAFF)
  // =========================================================================
  describe("Flow 3: Staff Unmatched Payments Queue & Manual Matching", () => {
    let testUnmatchedPaymentId: string;

    beforeAll(async () => {
      // Create an unmatched payment for testing staff matching
      const p = await prisma.payment.create({
        data: {
          amountPaise: BigInt(1200000), // ₹12,000
          source: "BANK_TRANSFER",
          gatewayRef: `neft_unmatched_test_${Date.now()}`,
          status: "UNMATCHED",
          notes: "NEFT from unknown bank account without UTR matching",
        },
      });
      testUnmatchedPaymentId = p.id;
    });

    it("rejects non-staff or non-ACCOUNTS roles from viewing unmatched payments", async () => {
      // Counsellor role attempt
      const req = new NextRequest("http://localhost:3000/api/staff/unmatched-payments", {
        headers: {
          Authorization: `Bearer ${counsellorStaffToken}`,
        },
      });

      const res = await getUnmatchedRoute(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toMatch(/sufficient privileges|forbidden/i);
    });

    it("allows ACCOUNTS staff to list unmatched payments", async () => {
      const req = new NextRequest("http://localhost:3000/api/staff/unmatched-payments", {
        headers: {
          Authorization: `Bearer ${accountsStaffToken}`,
        },
      });

      const res = await getUnmatchedRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.count).toBeGreaterThan(0);
      expect(json.payments.some((p: any) => p.id === testUnmatchedPaymentId)).toBe(true);
    });

    it("manually matches payment to a student in a single atomic transaction with audit log", async () => {
      // Match unmatched payment to STU-0010 (Foundation 2027 student with open instalments)
      const req = new NextRequest(
        `http://localhost:3000/api/staff/unmatched-payments/${testUnmatchedPaymentId}/match`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accountsStaffToken}`,
          },
          body: JSON.stringify({ studentId: "STU-0010" }),
        }
      );

      const res = await matchRoute(req, {
        params: Promise.resolve({ id: testUnmatchedPaymentId }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.receiptNo).toBeDefined();
      expect(json.allocations.length).toBeGreaterThan(0);

      // Verify payment was updated to MATCHED
      const updatedPayment = await prisma.payment.findUnique({
        where: { id: testUnmatchedPaymentId },
        include: { allocations: true, receipt: true },
      });
      expect(updatedPayment?.status).toBe("MATCHED");
      expect(updatedPayment?.studentId).toBe("STU-0010");
      expect(updatedPayment?.receipt).not.toBeNull();

      // Verify AuditLog record was written with staff actor ID
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          action: "MANUAL_PAYMENT_MATCH",
          entityId: testUnmatchedPaymentId,
        },
      });
      expect(auditLog).not.toBeNull();
      expect(auditLog?.actorId).toBe("usr_accounts_01");
    });

    it("rejects unmatched payment: marks as REJECTED and keeps row (never deletes)", async () => {
      // Create another unmatched payment to test rejection
      const pToReject = await prisma.payment.create({
        data: {
          amountPaise: BigInt(500000),
          source: "CASH",
          gatewayRef: `cash_unmatched_test_${Date.now()}`,
          status: "UNMATCHED",
          notes: "Spurious cash entry",
        },
      });

      const req = new NextRequest(
        `http://localhost:3000/api/staff/unmatched-payments/${pToReject.id}/reject`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accountsStaffToken}`,
          },
          body: JSON.stringify({ reason: "Unidentified deposit returned by bank" }),
        }
      );

      const res = await rejectRoute(req, {
        params: Promise.resolve({ id: pToReject.id }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe("REJECTED");

      // Verify row is KEPT in database (not deleted) and marked REJECTED
      const dbPayment = await prisma.payment.findUnique({
        where: { id: pToReject.id },
      });
      expect(dbPayment).not.toBeNull();
      expect(dbPayment?.status).toBe("REJECTED");
      expect(dbPayment?.notes).toContain("Unidentified deposit returned");

      // Verify AuditLog written
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          action: "REJECT_UNMATCHED_PAYMENT",
          entityId: pToReject.id,
        },
      });
      expect(auditLog?.actorId).toBe("usr_accounts_01");
    });
  });
});

