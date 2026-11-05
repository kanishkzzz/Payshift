import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/modules/auth/guards";
import { PaymentService, PaymentError } from "@/modules/payments/services/payment-service";

const matchPaymentSchema = z.object({
  studentId: z.string().min(1, "Student ID is required"),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Guarded: Only ACCOUNTS or ADMIN role staff can manually match payments
    const { user } = await requireStaff(["ACCOUNTS", "ADMIN"], req);

    const { id: paymentId } = await context.params;
    if (!paymentId) {
      return NextResponse.json(
        { error: "Payment ID is required" },
        { status: 400 }
      );
    }

    // 2. Validate input payload with Zod
    const body = await req.json().catch(() => ({}));
    const parsed = matchPaymentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    // 3. Execute manual match within single atomic database transaction
    const result = await PaymentService.manualMatchPayment(
      paymentId,
      parsed.data.studentId,
      user.id
    );

    return NextResponse.json({
      success: true,
      paymentId: result.paymentId,
      receiptNo: result.receiptNo,
      allocations: result.allocations,
    });
  } catch (err: unknown) {
    if (err instanceof PaymentError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.statusCode }
      );
    }

    const statusCode = (err as { statusCode?: number }).statusCode || 500;
    return NextResponse.json(
      { error: (err as Error).message },
      { status: statusCode }
    );
  }
}

