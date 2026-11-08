import { NextResponse } from "next/server";
import { requireParent } from "@/modules/auth/guards";
import { PaymentError, PaymentService } from "@/modules/payments/services/payment-service";

export async function GET(req: Request) {
  try {
    const { user } = await requireParent(req);
    const orderId = new URL(req.url).searchParams.get("orderId") ?? "";
    if (!orderId) return NextResponse.json({ error: "Payment order is required." }, { status: 400 });
    return NextResponse.json(await PaymentService.getMockCheckoutDetails(user.id, orderId));
  } catch (error) {
    if (error instanceof PaymentError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    return NextResponse.json({ error: "Unable to load checkout details." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { user } = await requireParent(req);
    const body = await req.json().catch(() => null) as { orderId?: string } | null;
    if (!body?.orderId) return NextResponse.json({ error: "Payment order is required." }, { status: 400 });
    return NextResponse.json(await PaymentService.completeMockCheckout(user.id, body.orderId));
  } catch (error) {
    if (error instanceof PaymentError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    return NextResponse.json({ error: "Unable to complete the mock payment." }, { status: 500 });
  }
}
