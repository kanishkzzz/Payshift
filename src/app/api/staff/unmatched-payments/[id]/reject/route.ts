import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/modules/auth/guards";
import { PaymentService, PaymentError } from "@/modules/payments/services/payment-service";

const rejectPaymentSchema = z.object({
  reason: z.string().max(255).optional(),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Guarded: Role ACCOUNTS or ADMIN only
    const { user } = await requireStaff(["ACCOUNTS", "ADMIN"], req);

    const { id: paymentId } = await context.params;
    if (!paymentId) {
      return NextResponse.json(
        { error: "Payment ID is required" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const parsed = rejectPaymentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    // 2. Reject payment: marked and kept, NEVER deleted
    const result = await PaymentService.rejectUnmatchedPayment(
      paymentId,
      user.id,
      parsed.data.reason
    );

    return NextResponse.json({
      success: true,
      paymentId: result.paymentId,
      status: "REJECTED",
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

