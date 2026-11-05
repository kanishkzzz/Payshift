import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/modules/auth/guards";
import { PaymentService } from "@/modules/payments/services/payment-service";

export async function GET(req: NextRequest) {
  try {
    // 1. Guarded by requireStaff: Role ACCOUNTS or ADMIN only
    await requireStaff(["ACCOUNTS", "ADMIN"], req);

    // 2. Fetch unmatched queue
    const payments = await PaymentService.getUnmatchedPayments();

    return NextResponse.json({
      success: true,
      count: payments.length,
      payments,
    });
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode || 500;
    return NextResponse.json(
      { error: (err as Error).message },
      { status: statusCode }
    );
  }
}

