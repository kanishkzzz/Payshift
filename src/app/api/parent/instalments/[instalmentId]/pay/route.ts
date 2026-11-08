import { NextRequest, NextResponse } from "next/server";
import { requireParent } from "@/modules/auth/guards";
import { PaymentService, PaymentError } from "@/modules/payments/services/payment-service";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ instalmentId: string }> }
) {
  try {
    // 1. Guarded by requireParent(). Guardian ID is derived from the session, never trusted from client body.
    const { user } = await requireParent(req);

    const { instalmentId } = await context.params;
    if (!instalmentId) {
      return NextResponse.json(
        { error: "Instalment ID is required" },
        { status: 400 }
      );
    }

    // 2. Create order using PaymentService
    const result = await PaymentService.createInstalmentPaymentOrder(
      user.id,
      instalmentId
    );

    return NextResponse.json({
      success: true,
      orderId: result.orderId,
      gatewayOrderId: result.gatewayOrderId,
      checkoutUrl: result.checkoutUrl,
      checkout: result.checkout,
      amountPaise: result.amountPaise,
    });
  } catch (err: unknown) {
    if (err instanceof PaymentError) {
      return NextResponse.json(
        {
          error: err.message,
          code: err.code,
          alreadyPaid: err.code === "ALREADY_PAID",
        },
        { status: err.statusCode }
      );
    }

    if ((err as { statusCode?: number }).statusCode === 401) {
      return NextResponse.json(
        { error: (err as Error).message },
        { status: 401 }
      );
    }

    console.error("[CreateOrderRoute] Unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to initiate payment. Please try again." },
      { status: 500 }
    );
  }
}

