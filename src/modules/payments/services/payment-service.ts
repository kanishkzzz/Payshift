import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getPaymentGateway } from "../gateways";
import { allocatePayment } from "@/modules/ledger/ledger-math";
import { checkRateLimit } from "@/lib/rate-limit";
import { OpenInstalmentInput } from "@/modules/ledger/types";

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

/**
 * Derives financial year from an IST date (April 1 - March 31).
 * e.g. Nov 2026 -> "2026", Feb 2027 -> "2026".
 */
export function getFinancialYearCode(date: Date = new Date()): string {
  // IST offset +05:30
  const istDate = new Date(date.getTime() + (5 * 60 + 30) * 60 * 1000);
  const year = istDate.getUTCFullYear();
  const month = istDate.getUTCMonth() + 1; // 1-12

  // April or later belongs to current year cohort; before April belongs to previous year
  return month >= 4 ? String(year) : String(year - 1);
}

/**
 * Atomically generates the next sequential receipt number for a centre and financial year.
 * Employs PostgreSQL row-level locking (SELECT ... FOR UPDATE) inside the active transaction.
 */
export async function getNextSequentialReceiptNo(
  tx: Prisma.TransactionClient,
  centre: { id: string; city: string; gstin?: string | null },
  financialYear: string
): Promise<{ receiptNo: string; gstin: string }> {
  const cityCode = centre.city.slice(0, 3).toUpperCase();
  const prefix = `RCP-${financialYear}-${cityCode}-`;

  // 1. Ensure ReceiptSequence row exists for (centreId, financialYear)
  let seqRecord = await tx.receiptSequence.findUnique({
    where: {
      centreId_financialYear: {
        centreId: centre.id,
        financialYear,
      },
    },
  });

  if (!seqRecord) {
    // Check if any receipts were previously seeded/created to continue sequence
    const latestReceipt = await tx.receipt.findFirst({
      where: {
        receiptNo: { startsWith: prefix },
      },
      orderBy: { receiptNo: "desc" },
    });

    let initialLastSeq = 0;
    if (latestReceipt) {
      const match = latestReceipt.receiptNo.match(/-(\d+)$/);
      if (match) {
        initialLastSeq = parseInt(match[1], 10);
      }
    }

    try {
      seqRecord = await tx.receiptSequence.create({
        data: {
          centreId: centre.id,
          financialYear,
          lastSeq: initialLastSeq,
        },
      });
    } catch {
      // Re-read in case of concurrent insert
      seqRecord = await tx.receiptSequence.findUnique({
        where: {
          centreId_financialYear: {
            centreId: centre.id,
            financialYear,
          },
        },
      });
    }
  }

  // 2. Lock the ReceiptSequence row exclusively using SELECT ... FOR UPDATE
  const lockedRows = await tx.$queryRaw<Array<{ id: string; last_seq: number }>>`
    SELECT "id", "last_seq" FROM "receipt_sequences"
    WHERE "centre_id" = ${centre.id} AND "financial_year" = ${financialYear}
    FOR UPDATE
  `;

  const currentSeq = lockedRows[0]?.last_seq ?? seqRecord?.lastSeq ?? 0;
  const nextSeq = currentSeq + 1;

  // 3. Increment sequence counter
  await tx.receiptSequence.update({
    where: { id: seqRecord!.id },
    data: { lastSeq: nextSeq },
  });

  const receiptNo = `${prefix}${String(nextSeq).padStart(4, "0")}`;
  const gstin = centre.gstin ?? "08AAAAA0000A1Z5";

  return { receiptNo, gstin };
}

export class PaymentService {
  /**
   * Flow 1: Create Order (Parent taps Pay).
   * 
   * Security & Business Invariants:
   * - Guarded by requireParent(). Guardian ID is derived strictly from the session.
   * - Confirms the instalment belongs to a student linked to this guardian.
   *   Returns 404 (not 403) if not found or not linked, to prevent leaking existence.
   * - Computes current balance for that instalment using the ledger.
   *   If balance is 0, returns a clear "already paid" response without creating an order.
   * - Rate-limits requests per guardian.
   * - Amount is derived from the balance, never trusted from client input.
   * - Never returns the gateway secret or raw gateway response.
   */
  static async createInstalmentPaymentOrder(
    guardianId: string,
    instalmentId: string
  ): Promise<{
    orderId: string;
    gatewayOrderId: string;
    checkoutUrl: string;
    amountPaise: string;
  }> {
    // 1. Rate-limit per guardian (max 10 order creations per minute)
    const rateLimit = checkRateLimit(`pay_order:${guardianId}`, 10, 60 * 1000);
    if (rateLimit.isLimited) {
      throw new PaymentError(
        "Too many payment requests. Please wait a moment before trying again.",
        429,
        "RATE_LIMITED"
      );
    }

    // 2. Query guardian
    const guardian = await prisma.guardian.findUnique({
      where: { id: guardianId },
    });
    if (!guardian) {
      throw new PaymentError("Guardian not found", 404, "NOT_FOUND");
    }

    // 3. Query instalment with student and allocations
    const instalment = await prisma.instalment.findUnique({
      where: { id: instalmentId },
      include: {
        enrollment: {
          include: {
            student: {
              include: {
                guardians: true,
              },
            },
          },
        },
        allocations: true,
      },
    });

    // 4. Return 404 if instalment does not exist
    if (!instalment) {
      throw new PaymentError("Instalment not found.", 404, "NOT_FOUND");
    }

    const student = instalment.enrollment.student;

    // 5. Confirm instalment belongs to a student linked to this guardian
    // Check direct studentId match or phone number link across guardians
    const isDirectMatch = guardian.studentId === student.id;
    const isPhoneMatch = student.guardians.some((g) => g.phone === guardian.phone);

    if (!isDirectMatch && !isPhoneMatch) {
      // Must return 404 (not 403) to avoid leaking existence of instalments to unauthorized parents
      throw new PaymentError("Instalment not found.", 404, "NOT_FOUND");
    }

    // 6. Compute current balance for that instalment
    const paidPaise = instalment.allocations.reduce(
      (sum, a) => sum + a.amountPaise,
      BigInt(0)
    );
    const balancePaise =
      instalment.amountPaise > paidPaise ? instalment.amountPaise - paidPaise : BigInt(0);

    if (balancePaise <= BigInt(0)) {
      throw new PaymentError(
        "This instalment is already paid in full. No payment is required.",
        400,
        "ALREADY_PAID"
      );
    }

    // 7. Call payment gateway adapter to create order
    // Use a unique orderRef (and primary key id) per payment attempt
    const orderRef = `po_${crypto.randomBytes(12).toString("hex")}`;
    const gateway = getPaymentGateway();
    const gatewayOrder = await gateway.createOrder({
      orderRef,
      amountPaise: balancePaise,
      currency: "INR",
      customer: {
        name: guardian.name,
        phone: guardian.phone,
        email: guardian.email || undefined,
      },
      notes: {
        instalmentId: instalment.id,
        guardianId: guardian.id,
        studentId: student.id,
      },
    });

    // 8. Create PaymentOrder record in database with status CREATED
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
      checkoutUrl: gatewayOrder.checkoutUrl,
      amountPaise: balancePaise.toString(),
    };
  }

  /**
   * Flow 2: Webhook Processing (The authoritative Source of Truth).
   * 
   * Security & Business Invariants:
   * - Verifies signature FIRST using timingSafeCompare. Rejects with 400 on failure.
   * - Does NOT parse body before signature verification.
   * - Never logs full webhook payload or signature. Logs event IDs and outcomes only.
   * - Idempotency: Uses ProcessedWebhookEvent table and Payment.gatewayRef uniqueness.
   *   If duplicate event arrives, returns 200 and does nothing.
   * - If gatewayOrderId is unknown: routes payment to UNMATCHED queue with note.
   * - If amountPaise differs from PaymentOrder: routes payment to UNMATCHED queue with note (no allocation).
   * - In a SINGLE database transaction:
   *   1. Creates Payment (MATCHED, source ONLINE_GATEWAY).
   *   2. Allocates payment oldest-due-date first via allocatePayment().
   *   3. Sets PaymentOrder.status = PAID.
   *   4. Generates sequential Receipt using ReceiptSequence locked with SELECT ... FOR UPDATE.
   *   5. Cancels SCHEDULED reminders for fully paid instalments -> SUPPRESSED_PAID.
   *   6. Records ProcessedWebhookEvent.
   *   7. Writes immutable AuditLog.
   * - If any step fails, entire transaction rolls back.
   */
  static async processWebhook(
    rawBody: string,
    signature: string
  ): Promise<{
    success: boolean;
    duplicate?: boolean;
    unmatched?: boolean;
    paymentId?: string;
    receiptNo?: string;
    reason?: string;
  }> {
    const gateway = getPaymentGateway();

    // 1. Verify signature BEFORE parsing the body
    const isValid = gateway.verifyWebhook(rawBody, signature);
    if (!isValid) {
      console.warn("[Webhook] Signature verification failed.");
      throw new PaymentError("Invalid webhook signature.", 400, "INVALID_SIGNATURE");
    }

    // 2. Parse verified webhook event
    const event = gateway.parseWebhookEvent(rawBody);
    console.log(`[Webhook] Processing verified event: ${event.eventId} (type: ${event.type})`);

    // 3. Idempotency Check: ProcessedWebhookEvent
    const existingEvent = await prisma.processedWebhookEvent.findUnique({
      where: { eventId: event.eventId },
    });
    if (existingEvent) {
      console.log(`[Webhook] Duplicate event ignored: ${event.eventId}`);
      return { success: true, duplicate: true };
    }

    // Check if Payment with this gatewayRef already exists
    if (event.gatewayPaymentId) {
      const existingPayment = await prisma.payment.findUnique({
        where: { gatewayRef: event.gatewayPaymentId },
      });
      if (existingPayment) {
        console.log(`[Webhook] Duplicate payment reference ignored: ${event.gatewayPaymentId}`);
        return { success: true, duplicate: true, paymentId: existingPayment.id };
      }
    }

    // 4. Look up PaymentOrder by gatewayOrderId
    const paymentOrder = await prisma.paymentOrder.findUnique({
      where: { gatewayOrderId: event.gatewayOrderId },
      include: {
        instalment: {
          include: {
            enrollment: {
              include: {
                student: {
                  include: {
                    batch: {
                      include: {
                        centre: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    // Case A: Unknown gatewayOrderId -> Unmatched queue
    if (!paymentOrder) {
      console.warn(`[Webhook] Unknown gatewayOrderId "${event.gatewayOrderId}". Routing to unmatched queue.`);
      const unmatchedPayment = await prisma.payment.create({
        data: {
          amountPaise: event.amountPaise,
          source: "ONLINE_GATEWAY",
          gatewayRef: event.gatewayPaymentId,
          status: "UNMATCHED",
          notes: `Unknown gatewayOrderId: ${event.gatewayOrderId}`,
        },
      });

      await prisma.processedWebhookEvent.create({
        data: {
          eventId: event.eventId,
          source: "ONLINE_GATEWAY",
        },
      });

      return {
        success: true,
        unmatched: true,
        paymentId: unmatchedPayment.id,
        reason: "UNKNOWN_ORDER",
      };
    }

    const student = paymentOrder.instalment.enrollment.student;

    // Case B: Amount mismatch -> Unmatched queue (do NOT allocate)
    if (event.amountPaise !== paymentOrder.amountPaise) {
      console.warn(
        `[Webhook] Amount mismatch for order ${paymentOrder.id}: expected ${paymentOrder.amountPaise} paise, received ${event.amountPaise} paise.`
      );

      const unmatchedPayment = await prisma.payment.create({
        data: {
          studentId: student.id,
          amountPaise: event.amountPaise,
          source: "ONLINE_GATEWAY",
          gatewayRef: event.gatewayPaymentId,
          status: "UNMATCHED",
          notes: `Amount mismatch: expected ₹${Number(paymentOrder.amountPaise) / 100}, received ₹${Number(event.amountPaise) / 100} for order ${paymentOrder.id}`,
        },
      });

      await prisma.processedWebhookEvent.create({
        data: {
          eventId: event.eventId,
          source: "ONLINE_GATEWAY",
        },
      });

      return {
        success: true,
        unmatched: true,
        paymentId: unmatchedPayment.id,
        reason: "AMOUNT_MISMATCH",
      };
    }

    // If event is failed, record in order and acknowledge
    if (event.status === "FAILED") {
      await prisma.paymentOrder.update({
        where: { id: paymentOrder.id },
        data: { status: "FAILED" },
      });
      await prisma.processedWebhookEvent.create({
        data: {
          eventId: event.eventId,
          source: "ONLINE_GATEWAY",
        },
      });
      return { success: true, reason: "PAYMENT_FAILED" };
    }

    // Case C: Legitimate payment match -> Single atomic database transaction
    return await prisma.$transaction(async (tx) => {
      // 1. Create Payment
      const payment = await tx.payment.create({
        data: {
          studentId: student.id,
          amountPaise: event.amountPaise,
          source: "ONLINE_GATEWAY",
          gatewayRef: event.gatewayPaymentId,
          status: "MATCHED",
          notes: `Online payment for order ${paymentOrder.id} (Gateway: ${event.gatewayOrderId})`,
        },
      });

      // 2. Fetch student's open instalments for allocation
      const studentEnrollments = await tx.enrollment.findMany({
        where: { studentId: student.id },
        include: {
          instalments: {
            include: { allocations: true },
            orderBy: { dueDate: "asc" },
          },
        },
      });

      const openInstalments: OpenInstalmentInput[] = [];
      for (const enr of studentEnrollments) {
        for (const inst of enr.instalments) {
          const paid = inst.allocations.reduce((sum, a) => sum + a.amountPaise, BigInt(0));
          const remaining = inst.amountPaise > paid ? inst.amountPaise - paid : BigInt(0);
          if (remaining > BigInt(0)) {
            openInstalments.push({
              id: inst.id,
              seq: inst.seq,
              dueDate: inst.dueDate,
              amountRupee: Math.round(Number(inst.amountPaise) / 100),
              paidRupee: Math.round(Number(paid) / 100),
              remainingRupee: Math.round(Number(remaining) / 100),
            });
          }
        }
      }

      const paymentRupee = Math.round(Number(event.amountPaise) / 100);
      const allocationResult = allocatePayment(paymentRupee, openInstalments);

      // Insert Allocation rows
      for (const alloc of allocationResult.allocations) {
        await tx.allocation.create({
          data: {
            paymentId: payment.id,
            instalmentId: alloc.instalmentId,
            amountPaise: BigInt(alloc.amountRupee * 100),
          },
        });
      }

      // 3. Set PaymentOrder.status = PAID
      await tx.paymentOrder.update({
        where: { id: paymentOrder.id },
        data: { status: "PAID" },
      });

      // 4. Sequential Receipt generation with PostgreSQL row lock (SELECT ... FOR UPDATE)
      const centre = student.batch.centre;
      const financialYear = getFinancialYearCode(new Date());
      const { receiptNo, gstin } = await getNextSequentialReceiptNo(tx, centre, financialYear);

      const taxablePaise = BigInt(Math.round(Number(event.amountPaise) / 1.18));
      const gstPaise = event.amountPaise - taxablePaise;

      const receipt = await tx.receipt.create({
        data: {
          paymentId: payment.id,
          receiptNo,
          gstin,
          taxablePaise,
          gstPaise,
          issuedAt: new Date(),
        },
      });

      // 5. Cancel SCHEDULED reminders for affected instalments that are now fully paid -> SUPPRESSED_PAID
      for (const alloc of allocationResult.allocations) {
        const updatedInstalment = await tx.instalment.findUnique({
          where: { id: alloc.instalmentId },
          include: { allocations: true },
        });
        if (updatedInstalment) {
          const totalPaid = updatedInstalment.allocations.reduce(
            (sum, a) => sum + a.amountPaise,
            BigInt(0)
          );
          if (totalPaid >= updatedInstalment.amountPaise) {
            await tx.reminder.updateMany({
              where: {
                instalmentId: updatedInstalment.id,
                status: "SCHEDULED",
              },
              data: {
                status: "SUPPRESSED_PAID",
              },
            });
          }
        }
      }

      // 6. Record ProcessedWebhookEvent for idempotency
      await tx.processedWebhookEvent.create({
        data: {
          eventId: event.eventId,
          source: "ONLINE_GATEWAY",
        },
      });

      // 7. Write immutable AuditLog entry
      await tx.auditLog.create({
        data: {
          actorId: "SYSTEM_WEBHOOK",
          action: "PAYMENT_MATCHED",
          entityType: "PAYMENT",
          entityId: payment.id,
          afterState: {
            paymentId: payment.id,
            gatewayRef: event.gatewayPaymentId,
            amountPaise: event.amountPaise.toString(),
            receiptNo: receipt.receiptNo,
            allocations: allocationResult.allocations,
          },
        },
      });

      console.log(`[Webhook] Successfully processed payment ${payment.id} for student ${student.id} (${receipt.receiptNo})`);

      return {
        success: true,
        paymentId: payment.id,
        receiptNo: receipt.receiptNo,
      };
    });
  }

  /**
   * Flow 3: List Unmatched Payments.
   * Access: ACCOUNTS or ADMIN staff only.
   */
  static async getUnmatchedPayments(): Promise<any[]> {
    const unmatched = await prisma.payment.findMany({
      where: { status: "UNMATCHED" },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            batch: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { receivedAt: "desc" },
    });

    return unmatched.map((p) => ({
      id: p.id,
      amountPaise: p.amountPaise.toString(),
      amountRupee: Math.round(Number(p.amountPaise) / 100),
      source: p.source,
      gatewayRef: p.gatewayRef,
      receivedAt: p.receivedAt,
      notes: p.notes,
      student: p.student,
    }));
  }

  /**
   * Flow 3: Manual Match of Unmatched Payment to a Student.
   * 
   * Security & Invariants:
   * - Only staff with role ACCOUNTS or ADMIN can invoke this action.
   * - Executes in a single database transaction.
   * - Runs the exact same ledger allocation and sequential receipt generation.
   * - Writes an audit entry recording the staff actorId.
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
    // 1. Verify unmatched payment exists
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) {
      throw new PaymentError("Payment not found.", 404, "NOT_FOUND");
    }
    if (payment.status !== "UNMATCHED") {
      throw new PaymentError(`Payment is not in UNMATCHED status (current: ${payment.status}).`, 400);
    }

    // 2. Verify target student exists
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        batch: {
          include: {
            centre: true,
          },
        },
      },
    });
    if (!student) {
      throw new PaymentError(`Student ID "${studentId}" not found.`, 404, "NOT_FOUND");
    }

    // 3. Execute in single atomic database transaction
    return await prisma.$transaction(async (tx) => {
      // Fetch student's open instalments
      const studentEnrollments = await tx.enrollment.findMany({
        where: { studentId: student.id },
        include: {
          instalments: {
            include: { allocations: true },
            orderBy: { dueDate: "asc" },
          },
        },
      });

      const openInstalments: OpenInstalmentInput[] = [];
      for (const enr of studentEnrollments) {
        for (const inst of enr.instalments) {
          const paid = inst.allocations.reduce((sum, a) => sum + a.amountPaise, BigInt(0));
          const remaining = inst.amountPaise > paid ? inst.amountPaise - paid : BigInt(0);
          if (remaining > BigInt(0)) {
            openInstalments.push({
              id: inst.id,
              seq: inst.seq,
              dueDate: inst.dueDate,
              amountRupee: Math.round(Number(inst.amountPaise) / 100),
              paidRupee: Math.round(Number(paid) / 100),
              remainingRupee: Math.round(Number(remaining) / 100),
            });
          }
        }
      }

      const paymentRupee = Math.round(Number(payment.amountPaise) / 100);
      const allocationResult = allocatePayment(paymentRupee, openInstalments);

      // Insert Allocation rows
      for (const alloc of allocationResult.allocations) {
        await tx.allocation.create({
          data: {
            paymentId: payment.id,
            instalmentId: alloc.instalmentId,
            amountPaise: BigInt(alloc.amountRupee * 100),
          },
        });
      }

      // Update payment record to MATCHED
      const updatedNotes = payment.notes
        ? `${payment.notes}; Manually matched to ${student.id} (${student.name})`
        : `Manually matched to ${student.id} (${student.name})`;

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          studentId: student.id,
          status: "MATCHED",
          notes: updatedNotes,
        },
      });

      // Sequential receipt generation with locked sequence row
      const centre = student.batch.centre;
      const financialYear = getFinancialYearCode(new Date());
      const { receiptNo, gstin } = await getNextSequentialReceiptNo(tx, centre, financialYear);

      const taxablePaise = BigInt(Math.round(Number(payment.amountPaise) / 1.18));
      const gstPaise = payment.amountPaise - taxablePaise;

      const receipt = await tx.receipt.create({
        data: {
          paymentId: payment.id,
          receiptNo,
          gstin,
          taxablePaise,
          gstPaise,
          issuedAt: new Date(),
        },
      });

      // Suppress scheduled reminders for now fully settled instalments
      for (const alloc of allocationResult.allocations) {
        const updatedInstalment = await tx.instalment.findUnique({
          where: { id: alloc.instalmentId },
          include: { allocations: true },
        });
        if (updatedInstalment) {
          const totalPaid = updatedInstalment.allocations.reduce(
            (sum, a) => sum + a.amountPaise,
            BigInt(0)
          );
          if (totalPaid >= updatedInstalment.amountPaise) {
            await tx.reminder.updateMany({
              where: {
                instalmentId: updatedInstalment.id,
                status: "SCHEDULED",
              },
              data: {
                status: "SUPPRESSED_PAID",
              },
            });
          }
        }
      }

      // Write AuditLog entry with actor ID
      await tx.auditLog.create({
        data: {
          actorId,
          action: "MANUAL_PAYMENT_MATCH",
          entityType: "PAYMENT",
          entityId: payment.id,
          afterState: {
            paymentId: payment.id,
            studentId: student.id,
            receiptNo: receipt.receiptNo,
            allocations: allocationResult.allocations,
            unallocatedRupee: allocationResult.unallocatedRupee,
          },
        },
      });

      return {
        success: true,
        paymentId: payment.id,
        receiptNo: receipt.receiptNo,
        allocations: allocationResult.allocations,
      };
    });
  }

  /**
   * Flow 3: Reject Unmatched Payment.
   * Rejected items are marked and kept, NEVER deleted.
   */
  static async rejectUnmatchedPayment(
    paymentId: string,
    actorId: string,
    reason?: string
  ): Promise<{ success: boolean; paymentId: string }> {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) {
      throw new PaymentError("Payment not found.", 404, "NOT_FOUND");
    }

    const rejectionNote = reason
      ? `Rejected: ${reason}`
      : "Payment rejected as invalid/untraceable by staff";

    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: "REJECTED",
        notes: payment.notes ? `${payment.notes} | ${rejectionNote}` : rejectionNote,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId,
        action: "REJECT_UNMATCHED_PAYMENT",
        entityType: "PAYMENT",
        entityId: paymentId,
        afterState: {
          paymentId,
          reason,
          status: "REJECTED",
        },
      },
    });

    return { success: true, paymentId };
  }
}

