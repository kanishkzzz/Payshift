import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getPaymentGateway } from "../gateways";
import { splitGstInclusive } from "../gst";
import { allocatePayment } from "@/modules/ledger/ledger-math";
import { checkRateLimit } from "@/lib/rate-limit";
import type { OpenInstalmentInput } from "@/modules/ledger/types";
import type { CheckoutPayload, NormalisedWebhookEvent } from "../types";

const ZERO = BigInt(0);
const HUNDRED = BigInt(100);
const ORDER_REUSE_WINDOW_MS = 6 * 60 * 60 * 1000; // reuse an open order for 6h
const TX_OPTIONS = { maxWait: 5000, timeout: 15000 };

type Tx = Prisma.TransactionClient;

type CentreRef = { id: string; city: string; gstin: string | null };
type StudentWithCentre = { id: string; batch: { centre: CentreRef } };

export class PaymentError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public code?: string
  ) {
    super(message);
    this.name = "PaymentError";
  }
}

export interface SettleResult {
  success: boolean;
  duplicate?: boolean;
  unmatched?: boolean;
  paymentId?: string;
  receiptNo?: string;
  reason?: string;
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/** Financial year from an IST date (Apr 1 - Mar 31). Nov 2026 -> "2026", Feb 2027 -> "2026". */
export function getFinancialYearCode(date: Date = new Date()): string {
  const istDate = new Date(date.getTime() + (5 * 60 + 30) * 60 * 1000);
  const year = istDate.getUTCFullYear();
  const month = istDate.getUTCMonth() + 1;
  return month >= 4 ? String(year) : String(year - 1);
}

/**
 * Atomically issues the next receipt number for (centre, financial year).
 * INSERT ... ON CONFLICT never errors (a failed statement would abort the whole
 * Postgres transaction), and UPDATE ... RETURNING takes the row lock and increments
 * in a single statement.
 */
export async function getNextSequentialReceiptNo(
  tx: Tx,
  centre: CentreRef,
  financialYear: string
): Promise<{ receiptNo: string; gstin: string }> {
  const cityCode = centre.city.slice(0, 3).toUpperCase();
  const prefix = `RCP-${financialYear}-${cityCode}-`;

  const existing = await tx.receiptSequence.findUnique({
    where: { centreId_financialYear: { centreId: centre.id, financialYear } },
    select: { id: true },
  });

  if (!existing) {
    // Continue after any seeded receipts with this prefix.
    const latest = await tx.receipt.findFirst({
      where: { receiptNo: { startsWith: prefix } },
      orderBy: { receiptNo: "desc" },
      select: { receiptNo: true },
    });
    const match = latest?.receiptNo.match(/-(\d+)$/);
    const initialLastSeq = match ? parseInt(match[1], 10) : 0;

    await tx.$executeRaw`
      INSERT INTO "receipt_sequences" ("id", "centre_id", "financial_year", "last_seq", "updated_at")
      VALUES (${crypto.randomUUID()}, ${centre.id}, ${financialYear}, ${initialLastSeq}, NOW())
      ON CONFLICT ("centre_id", "financial_year") DO NOTHING
    `;
  }

  const rows = await tx.$queryRaw<Array<{ last_seq: number }>>`
    UPDATE "receipt_sequences"
    SET "last_seq" = "last_seq" + 1, "updated_at" = NOW()
    WHERE "centre_id" = ${centre.id} AND "financial_year" = ${financialYear}
    RETURNING "last_seq"
  `;
  if (!rows[0]) {
    throw new Error(`Receipt sequence missing for centre ${centre.id} / FY ${financialYear}`);
  }

  let gstin = centre.gstin;
  if (!gstin) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(`Centre ${centre.id} has no GSTIN; cannot issue a GST receipt.`);
    }
    gstin = "08AAAAA0000A1Z5"; // dev placeholder only
  }

  const receiptNo = `${prefix}${String(Number(rows[0].last_seq)).padStart(4, "0")}`;
  return { receiptNo, gstin };
}

/** Open instalments for a student, in whole rupees (instalments are generated in whole rupees). */
async function loadOpenInstalments(tx: Tx, studentId: string): Promise<OpenInstalmentInput[]> {
  const enrollments = await tx.enrollment.findMany({
    where: { studentId },
    include: {
      instalments: { include: { allocations: true }, orderBy: { dueDate: "asc" } },
    },
  });

  const open: OpenInstalmentInput[] = [];
  for (const enr of enrollments) {
    for (const inst of enr.instalments) {
      const paid = inst.allocations.reduce((sum, a) => sum + a.amountPaise, ZERO);
      const remaining = inst.amountPaise > paid ? inst.amountPaise - paid : ZERO;
      const remainingRupee = Number(remaining / HUNDRED);
      if (remainingRupee > 0) {
        open.push({
          id: inst.id,
          seq: inst.seq,
          dueDate: inst.dueDate,
          amountRupee: Number(inst.amountPaise / HUNDRED),
          remainingRupee,
        });
      }
    }
  }
  return open;
}

/**
 * Shared by webhook, checkout verification and manual match:
 * allocate oldest-first, issue the receipt, suppress reminders for settled instalments.
 * Any amount that cannot be allocated is returned (and audited), never invented or dropped.
 */
async function allocateAndIssueReceipt(
  tx: Tx,
  payment: { id: string; amountPaise: bigint },
  student: StudentWithCentre
): Promise<{
  receiptNo: string;
  allocations: Array<{ instalmentId: string; amountRupee: number }>;
  unallocatedPaise: bigint;
}> {
  const openInstalments = await loadOpenInstalments(tx, student.id);
  const wholeRupees = Number(payment.amountPaise / HUNDRED);

  const allocations =
    wholeRupees > 0 && openInstalments.length > 0
      ? allocatePayment(wholeRupees, openInstalments).allocations
      : [];

  let allocatedPaise = ZERO;
  for (const alloc of allocations) {
    const amountPaise = BigInt(alloc.amountRupee) * HUNDRED;
    await tx.allocation.create({
      data: { paymentId: payment.id, instalmentId: alloc.instalmentId, amountPaise },
    });
    allocatedPaise += amountPaise;
  }

  const financialYear = getFinancialYearCode(new Date());
  const { receiptNo, gstin } = await getNextSequentialReceiptNo(
    tx,
    student.batch.centre,
    financialYear
  );
  const { taxablePaise, gstPaise } = splitGstInclusive(payment.amountPaise);

  await tx.receipt.create({
    data: {
      paymentId: payment.id,
      receiptNo,
      gstin,
      taxablePaise,
      gstPaise,
      issuedAt: new Date(),
    },
  });

  if (allocations.length > 0) {
    const touched = await tx.instalment.findMany({
      where: { id: { in: allocations.map((a) => a.instalmentId) } },
      include: { allocations: true },
    });
    const settledIds = touched
      .filter((i) => i.allocations.reduce((s, a) => s + a.amountPaise, ZERO) >= i.amountPaise)
      .map((i) => i.id);

    if (settledIds.length > 0) {
      await tx.reminder.updateMany({
        where: { instalmentId: { in: settledIds }, status: "SCHEDULED" },
        data: { status: "SUPPRESSED_PAID" },
      });
    }
  }

  return { receiptNo, allocations, unallocatedPaise: payment.amountPaise - allocatedPaise };
}

async function recordProcessedEvent(eventId: string, source: string): Promise<void> {
  try {
    await prisma.processedWebhookEvent.create({ data: { eventId, source } });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
  }
}

async function routeToUnmatched(
  event: NormalisedWebhookEvent,
  source: string,
  studentId: string | null,
  note: string,
  reason: string
): Promise<SettleResult> {
  const [payment] = await prisma.$transaction([
    prisma.payment.create({
      data: {
        studentId,
        amountPaise: event.amountPaise,
        source: "ONLINE_GATEWAY",
        gatewayRef: event.gatewayPaymentId,
        status: "UNMATCHED",
        receivedAt: event.occurredAt ?? new Date(),
        notes: note,
      },
    }),
    prisma.processedWebhookEvent.create({ data: { eventId: event.eventId, source } }),
  ]);

  await prisma.auditLog.create({
    data: {
      actorId: "SYSTEM_WEBHOOK",
      action: "PAYMENT_UNMATCHED",
      entityType: "PAYMENT",
      entityId: payment.id,
      afterState: {
        gatewayRef: event.gatewayPaymentId,
        gatewayOrderId: event.gatewayOrderId,
        amountPaise: event.amountPaise.toString(),
        reason,
      },
    },
  });

  console.warn(`[Payments] Event ${event.eventId} routed to unmatched queue (${reason}).`);
  return { success: true, unmatched: true, paymentId: payment.id, reason };
}

/**
 * Single idempotent entry point for "the gateway says money moved".
 * Safe to call from the webhook AND from checkout verification for the same payment.
 */
export async function settleGatewayEvent(
  event: NormalisedWebhookEvent,
  source: string = "ONLINE_GATEWAY"
): Promise<SettleResult> {
  // 1. Event-level idempotency
  const seen = await prisma.processedWebhookEvent.findUnique({
    where: { eventId: event.eventId },
  });
  if (seen) return { success: true, duplicate: true };

  // 2. Anything that is not money-in never touches the ledger
  if (event.status !== "PAID") {
    if (event.status === "FAILED" && event.gatewayOrderId) {
      await prisma.paymentOrder.updateMany({
        where: { gatewayOrderId: event.gatewayOrderId, status: "CREATED" },
        data: { status: "FAILED" },
      });
    }
    await recordProcessedEvent(event.eventId, source);
    return {
      success: true,
      reason: event.status === "FAILED" ? "PAYMENT_FAILED" : "IGNORED_EVENT",
    };
  }

  if (!event.gatewayPaymentId) {
    throw new PaymentError("Paid event is missing a payment id.", 400, "INVALID_EVENT");
  }

  // 3. Payment-level idempotency (payment.captured + order.paid share one payment id)
  const existingPayment = await prisma.payment.findUnique({
    where: { gatewayRef: event.gatewayPaymentId },
    include: { receipt: { select: { receiptNo: true } } },
  });
  if (existingPayment) {
    await recordProcessedEvent(event.eventId, source);
    return {
      success: true,
      duplicate: true,
      paymentId: existingPayment.id,
      receiptNo: existingPayment.receipt?.receiptNo,
    };
  }

  const paymentOrder = await prisma.paymentOrder.findUnique({
    where: { gatewayOrderId: event.gatewayOrderId },
    include: {
      instalment: {
        include: {
          enrollment: {
            include: { student: { include: { batch: { include: { centre: true } } } } },
          },
        },
      },
    },
  });

  try {
    if (!paymentOrder) {
      return await routeToUnmatched(
        event,
        source,
        null,
        `Unknown gatewayOrderId: ${event.gatewayOrderId}`,
        "UNKNOWN_ORDER"
      );
    }

    const student = paymentOrder.instalment.enrollment.student;

    if (event.amountPaise !== paymentOrder.amountPaise) {
      return await routeToUnmatched(
        event,
        source,
        student.id,
        `Amount mismatch: expected ${paymentOrder.amountPaise} paise, received ${event.amountPaise} paise for order ${paymentOrder.id}`,
        "AMOUNT_MISMATCH"
      );
    }

    return await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          studentId: student.id,
          amountPaise: event.amountPaise,
          source: "ONLINE_GATEWAY",
          gatewayRef: event.gatewayPaymentId,
          status: "MATCHED",
          receivedAt: event.occurredAt ?? new Date(),
          notes: `Online payment for order ${paymentOrder.id} (gateway order ${event.gatewayOrderId}${event.method ? `, ${event.method}` : ""
            })`,
        },
      });

      const applied = await allocateAndIssueReceipt(tx, payment, student);

      await tx.paymentOrder.update({
        where: { id: paymentOrder.id },
        data: { status: "PAID" },
      });

      await tx.processedWebhookEvent.create({ data: { eventId: event.eventId, source } });

      await tx.auditLog.create({
        data: {
          actorId: "SYSTEM_WEBHOOK",
          action: "PAYMENT_MATCHED",
          entityType: "PAYMENT",
          entityId: payment.id,
          afterState: {
            paymentId: payment.id,
            gatewayRef: event.gatewayPaymentId,
            eventType: event.type,
            amountPaise: event.amountPaise.toString(),
            receiptNo: applied.receiptNo,
            allocations: applied.allocations,
            unallocatedPaise: applied.unallocatedPaise.toString(),
          },
        },
      });

      if (applied.unallocatedPaise > ZERO) {
        console.warn(
          `[Payments] Payment ${payment.id} has ${applied.unallocatedPaise} paise unallocated (student credit).`
        );
      }

      console.log(
        `[Payments] Settled payment ${payment.id} for student ${student.id} (${applied.receiptNo})`
      );
      return { success: true, paymentId: payment.id, receiptNo: applied.receiptNo };
    }, TX_OPTIONS);
  } catch (err) {
    // A concurrent delivery of the same payment won the race; this one is a no-op.
    if (isUniqueViolation(err)) return { success: true, duplicate: true };
    throw err;
  }
}

/** Legacy field for existing callers/tests: only the mock gateway has a redirect URL. */
function legacyCheckoutUrl(checkout: CheckoutPayload): string | undefined {
  return checkout.provider === "mock" ? checkout.checkoutUrl : undefined;
}

export class PaymentService {
  static async getMockCheckoutDetails(guardianId: string, orderId: string) {
    if (process.env.NODE_ENV === "production" || getPaymentGateway().provider !== "mock") {
      throw new PaymentError("Mock checkout is only available in development.", 404, "NOT_FOUND");
    }
    const order = await prisma.paymentOrder.findUnique({ where: { id: orderId } });
    if (!order || order.guardianId !== guardianId || !order.gatewayOrderId.startsWith("order_mock_")) {
      throw new PaymentError("Payment order not found.", 404, "NOT_FOUND");
    }
    return { amountPaise: order.amountPaise.toString(), status: order.status };
  }

  /** Development-only confirmation for the authenticated mock checkout screen. */
  static async completeMockCheckout(guardianId: string, orderId: string) {
    if (process.env.NODE_ENV === "production" || getPaymentGateway().provider !== "mock") {
      throw new PaymentError("Mock checkout is only available in development.", 404, "NOT_FOUND");
    }
    const order = await prisma.paymentOrder.findUnique({ where: { id: orderId } });
    if (!order || order.guardianId !== guardianId || !order.gatewayOrderId.startsWith("order_mock_")) {
      throw new PaymentError("Payment order not found.", 404, "NOT_FOUND");
    }
    if (order.status !== "CREATED") {
      const payment = await prisma.payment.findFirst({
        where: { gatewayRef: { startsWith: `pay_mock_${order.id}` } },
        include: { receipt: { select: { receiptNo: true } } },
      });
      return { status: payment?.status === "MATCHED" ? "PAID" : order.status === "FAILED" ? "FAILED" : "CONFIRMING", receiptNo: payment?.receipt?.receiptNo };
    }
    const result = await settleGatewayEvent({
      eventId: `mock-checkout:${order.id}`,
      type: "payment.captured",
      gatewayOrderId: order.gatewayOrderId,
      gatewayPaymentId: `pay_mock_${order.id}`,
      amountPaise: order.amountPaise,
      status: "PAID",
      occurredAt: new Date(),
      method: "mock",
    }, "MOCK_CHECKOUT");
    return { status: result.unmatched ? "UNDER_REVIEW" : "PAID", receiptNo: result.receiptNo };
  }

  /**
   * Flow 1: Parent taps "Pay".
   * - guardianId comes from requireParent(), never from the client.
   * - Amount is derived from the ledger balance, never from client input.
   * - Returns 404 (not 403) for unlinked instalments to prevent enumeration.
   * - Reuses a recent open order for the same amount to prevent double payment.
   */
  static async createInstalmentPaymentOrder(
    guardianId: string,
    instalmentId: string
  ): Promise<{
    orderId: string;
    gatewayOrderId: string;
    amountPaise: string;
    checkout: CheckoutPayload;
    checkoutUrl?: string; // legacy field: mock gateway only
  }> {
    const rateLimit = checkRateLimit(`pay_order:${guardianId}`, 10, 60 * 1000);
    if (rateLimit.isLimited) {
      throw new PaymentError(
        "Too many payment requests. Please wait a moment before trying again.",
        429,
        "RATE_LIMITED"
      );
    }

    const guardian = await prisma.guardian.findUnique({ where: { id: guardianId } });
    if (!guardian) throw new PaymentError("Guardian not found", 404, "NOT_FOUND");

    const instalment = await prisma.instalment.findUnique({
      where: { id: instalmentId },
      include: {
        enrollment: { include: { student: { include: { guardians: true } } } },
        allocations: true,
      },
    });
    if (!instalment) throw new PaymentError("Instalment not found.", 404, "NOT_FOUND");

    const student = instalment.enrollment.student;
    const isDirectMatch = guardian.studentId === student.id;
    const isPhoneMatch = student.guardians.some((g) => g.phone === guardian.phone);
    if (!isDirectMatch && !isPhoneMatch) {
      throw new PaymentError("Instalment not found.", 404, "NOT_FOUND");
    }

    const paidPaise = instalment.allocations.reduce((sum, a) => sum + a.amountPaise, ZERO);
    const balancePaise =
      instalment.amountPaise > paidPaise ? instalment.amountPaise - paidPaise : ZERO;

    if (balancePaise <= ZERO) {
      throw new PaymentError(
        "This instalment is already paid in full. No payment is required.",
        400,
        "ALREADY_PAID"
      );
    }
    if (balancePaise < HUNDRED) {
      throw new PaymentError(
        "Remaining balance is below ₹1. Please contact the accounts office.",
        400,
        "AMOUNT_TOO_SMALL"
      );
    }

    const gateway = getPaymentGateway();
    const customer = {
      name: guardian.name,
      phone: guardian.phone,
      email: guardian.email || undefined,
    };

    // Reuse a recent open order for the same amount (same gateway) instead of creating duplicates.
    const reusable = await prisma.paymentOrder.findFirst({
      where: {
        instalmentId: instalment.id,
        guardianId: guardian.id,
        status: "CREATED",
        amountPaise: balancePaise,
        createdAt: { gte: new Date(Date.now() - ORDER_REUSE_WINDOW_MS) },
      },
      orderBy: { createdAt: "desc" },
    });
    const reusableMatchesGateway =
      reusable !== null &&
      reusable.gatewayOrderId.startsWith("order_mock_") === (gateway.provider === "mock");

    if (reusable && reusableMatchesGateway) {
      const checkout = gateway.buildCheckout({
        gatewayOrderId: reusable.gatewayOrderId,
        orderRef: reusable.id,
        amountPaise: balancePaise,
        customer,
      });
      return {
        orderId: reusable.id,
        gatewayOrderId: reusable.gatewayOrderId,
        amountPaise: balancePaise.toString(),
        checkout,
        checkoutUrl: legacyCheckoutUrl(checkout),
      };
    }

    const orderRef = `po_${crypto.randomBytes(12).toString("hex")}`;
    const gatewayOrder = await gateway.createOrder({
      orderRef,
      amountPaise: balancePaise,
      currency: "INR",
      customer,
      notes: { instalmentId: instalment.id, guardianId: guardian.id, studentId: student.id },
    });

    const paymentOrder = await prisma.paymentOrder.create({
      data: {
        id: orderRef,
        instalmentId: instalment.id,
        guardianId: guardian.id,
        amountPaise: balancePaise,
        gatewayOrderId: gatewayOrder.gatewayOrderId,
        status: "CREATED",
      },
    });

    return {
      orderId: paymentOrder.id,
      gatewayOrderId: gatewayOrder.gatewayOrderId,
      amountPaise: balancePaise.toString(),
      checkout: gatewayOrder.checkout,
      checkoutUrl: legacyCheckoutUrl(gatewayOrder.checkout),
    };
  }

  /**
   * Flow 2: Webhook (source of truth).
   * Verifies the signature on the RAW body first, then parses, then settles.
   * Accepts request Headers, or a plain signature string (legacy callers/tests).
   * Never logs the payload or signature.
   */
  static async processWebhook(
    rawBody: string,
    headersOrSignature: Headers | string
  ): Promise<SettleResult> {
    const gateway = getPaymentGateway();
    const headers =
      typeof headersOrSignature === "string"
        ? new Headers({ [gateway.signatureHeader]: headersOrSignature })
        : headersOrSignature;
    const signature = headers.get(gateway.signatureHeader) ?? "";

    if (!gateway.verifyWebhook(rawBody, signature)) {
      console.warn("[Webhook] Signature verification failed.");
      throw new PaymentError("Invalid webhook signature.", 400, "INVALID_SIGNATURE");
    }

    let event: NormalisedWebhookEvent;
    try {
      event = gateway.parseWebhookEvent(rawBody, headers);
    } catch {
      throw new PaymentError("Malformed webhook payload.", 400, "INVALID_PAYLOAD");
    }

    console.log(`[Webhook] Verified event ${event.eventId} (${event.type})`);
    return settleGatewayEvent(event, "ONLINE_GATEWAY");
  }

  /**
   * Browser checkout callback. Never trusts browser values:
   * the signature is checked against OUR stored order id.
   *
   * Default (README invariant): read-only. Reports PAID only if the webhook
   * has already settled it, otherwise CONFIRMING.
   *
   * RAZORPAY_SETTLE_ON_VERIFY="true" (local dev, no public webhook URL):
   * fetches the payment server-to-server from Razorpay and settles it through
   * the same idempotent settleGatewayEvent the webhook uses.
   */
  static async verifyCheckoutPayment(
    guardianId: string,
    instalmentId: string,
    input: { gatewayOrderId: string; gatewayPaymentId: string; signature: string }
  ): Promise<{
    status: "PAID" | "CONFIRMING" | "FAILED" | "UNDER_REVIEW";
    receiptNo?: string;
  }> {
    const gateway = getPaymentGateway();
    if (!gateway.verifyCheckoutSignature) {
      throw new PaymentError(
        "Checkout verification is not supported for this gateway.",
        400,
        "UNSUPPORTED"
      );
    }

    const order = await prisma.paymentOrder.findUnique({
      where: { gatewayOrderId: input.gatewayOrderId },
    });
    // 404 (not 403) for wrong guardian or wrong instalment: no existence leaks
    if (!order || order.guardianId !== guardianId || order.instalmentId !== instalmentId) {
      throw new PaymentError("Payment order not found.", 404, "NOT_FOUND");
    }

    if (
      !gateway.verifyCheckoutSignature(order.gatewayOrderId, input.gatewayPaymentId, input.signature)
    ) {
      throw new PaymentError("Payment signature could not be verified.", 400, "INVALID_SIGNATURE");
    }

    const existing = await prisma.payment.findUnique({
      where: { gatewayRef: input.gatewayPaymentId },
      include: { receipt: { select: { receiptNo: true } } },
    });
    if (existing) {
      return {
        status: existing.status === "MATCHED" ? "PAID" : "UNDER_REVIEW",
        receiptNo: existing.receipt?.receiptNo,
      };
    }

    const settleOnVerify = process.env.RAZORPAY_SETTLE_ON_VERIFY === "true";
    if (!settleOnVerify || !gateway.fetchPayment) {
      return { status: "CONFIRMING" }; // webhook will settle it
    }

    const fetched = await gateway.fetchPayment(input.gatewayPaymentId);
    if (fetched.gatewayOrderId !== order.gatewayOrderId) {
      throw new PaymentError("Payment does not belong to this order.", 400, "ORDER_MISMATCH");
    }
    if (fetched.status === "FAILED") return { status: "FAILED" };
    if (fetched.status !== "PAID") return { status: "CONFIRMING" }; // e.g. authorized, not captured

    const result = await settleGatewayEvent(
      {
        eventId: `verify:${fetched.gatewayPaymentId}`,
        type: "checkout.verified",
        gatewayOrderId: fetched.gatewayOrderId,
        gatewayPaymentId: fetched.gatewayPaymentId,
        amountPaise: fetched.amountPaise,
        status: "PAID",
        occurredAt: fetched.occurredAt,
        method: fetched.method,
      },
      "CHECKOUT_VERIFY"
    );
    if (result.unmatched) return { status: "UNDER_REVIEW" };

    let receiptNo = result.receiptNo;
    if (!receiptNo) {
      const settled = await prisma.payment.findUnique({
        where: { gatewayRef: fetched.gatewayPaymentId },
        include: { receipt: { select: { receiptNo: true } } },
      });
      receiptNo = settled?.receipt?.receiptNo;
    }
    return { status: "PAID", receiptNo };
  }

  /** Flow 3: Unmatched queue. Access: ACCOUNTS or ADMIN (enforced in the route via requireStaff). */
  static async getUnmatchedPayments() {
    const unmatched = await prisma.payment.findMany({
      where: { status: "UNMATCHED" },
      include: {
        student: {
          select: { id: true, name: true, batch: { select: { id: true, name: true } } },
        },
      },
      orderBy: { receivedAt: "desc" },
    });

    return unmatched.map((p) => ({
      id: p.id,
      amountPaise: p.amountPaise.toString(),
      amountRupee: Number(p.amountPaise / HUNDRED),
      source: p.source,
      gatewayRef: p.gatewayRef,
      receivedAt: p.receivedAt,
      notes: p.notes,
      student: p.student,
    }));
  }

  /**
   * Flow 3: Manual match. The UNMATCHED -> MATCHED flip happens inside the
   * transaction, so two staff members can never double-allocate the same payment.
   */
  static async manualMatchPayment(
    paymentId: string,
    studentId: string,
    actorId: string
  ): Promise<{
    success: boolean;
    paymentId: string;
    receiptNo: string;
    allocations: Array<{ instalmentId: string; amountRupee: number }>;
  }> {
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new PaymentError("Payment not found.", 404, "NOT_FOUND");
    if (payment.status !== "UNMATCHED") {
      throw new PaymentError(
        `Payment is not in UNMATCHED status (current: ${payment.status}).`,
        409,
        "ALREADY_RESOLVED"
      );
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: { batch: { include: { centre: true } } },
    });
    if (!student) {
      throw new PaymentError(`Student ID "${studentId}" not found.`, 404, "NOT_FOUND");
    }

    return prisma.$transaction(async (tx) => {
      const note = `Manually matched to ${student.id} (${student.name})`;
      const claimed = await tx.payment.updateMany({
        where: { id: paymentId, status: "UNMATCHED" },
        data: {
          status: "MATCHED",
          studentId: student.id,
          notes: payment.notes ? `${payment.notes}; ${note}` : note,
        },
      });
      if (claimed.count === 0) {
        throw new PaymentError(
          "Payment is no longer in the unmatched queue.",
          409,
          "ALREADY_RESOLVED"
        );
      }

      const applied = await allocateAndIssueReceipt(tx, payment, student);

      await tx.auditLog.create({
        data: {
          actorId,
          action: "MANUAL_PAYMENT_MATCH",
          entityType: "PAYMENT",
          entityId: payment.id,
          afterState: {
            paymentId: payment.id,
            studentId: student.id,
            receiptNo: applied.receiptNo,
            allocations: applied.allocations,
            unallocatedPaise: applied.unallocatedPaise.toString(),
          },
        },
      });

      return {
        success: true,
        paymentId: payment.id,
        receiptNo: applied.receiptNo,
        allocations: applied.allocations,
      };
    }, TX_OPTIONS);
  }

  /** Flow 3: Reject. Only UNMATCHED payments; rejected rows are kept forever, never deleted. */
  static async rejectUnmatchedPayment(
    paymentId: string,
    actorId: string,
    reason?: string
  ): Promise<{ success: boolean; paymentId: string }> {
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new PaymentError("Payment not found.", 404, "NOT_FOUND");

    const rejectionNote = reason
      ? `Rejected: ${reason}`
      : "Payment rejected as invalid/untraceable by staff";

    const result = await prisma.payment.updateMany({
      where: { id: paymentId, status: "UNMATCHED" },
      data: {
        status: "REJECTED",
        notes: payment.notes ? `${payment.notes} | ${rejectionNote}` : rejectionNote,
      },
    });
    if (result.count === 0) {
      throw new PaymentError("Only unmatched payments can be rejected.", 409, "NOT_UNMATCHED");
    }

    await prisma.auditLog.create({
      data: {
        actorId,
        action: "REJECT_UNMATCHED_PAYMENT",
        entityType: "PAYMENT",
        entityId: paymentId,
        afterState: { paymentId, reason, status: "REJECTED" },
      },
    });

    return { success: true, paymentId };
  }
}
