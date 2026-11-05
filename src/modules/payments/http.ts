import { NextResponse } from "next/server";
import { AuthError } from "@/modules/auth";
import { PaymentError } from "./services/payment-service";

export function paymentErrorResponse(err: unknown) {
    if (err instanceof AuthError) {
        return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    if (err instanceof PaymentError) {
        return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    console.error("[Payments] Unexpected error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}