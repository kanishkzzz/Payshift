import { NextResponse } from "next/server";
import { z } from "zod";
import { requireParent } from "@/modules/auth";
import { PaymentService } from "@/modules/payments/services/payment-service";
import { paymentErrorResponse } from "@/modules/payments/http";


const bodySchema = z.object({
    razorpay_order_id: z.string().trim().min(1),
    razorpay_payment_id: z.string().trim().min(1),
    razorpay_signature: z.string().trim().min(1),
});

export async function POST(
    req: Request,
    { params }: { params: Promise<{ instalmentId: string }> }
) {
    try {
        const { user } = await requireParent(req);
        const { instalmentId } = await params;

        const parsed = bodySchema.safeParse(await req.json().catch(() => null));
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid payment confirmation." }, { status: 400 });
        }

        const result = await PaymentService.verifyCheckoutPayment(user.id, instalmentId, {
            gatewayOrderId: parsed.data.razorpay_order_id,
            gatewayPaymentId: parsed.data.razorpay_payment_id,
            signature: parsed.data.razorpay_signature,
        });
        return NextResponse.json(result);
    } catch (err) {
        return paymentErrorResponse(err);
    }
}