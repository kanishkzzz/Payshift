import { NextRequest, NextResponse } from "next/server";
import { AuthService } from "@/modules/auth/auth-service";
import { AuthError } from "@/modules/auth/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await AuthService.verifyOtp(body.phone, body.otp, { setCookie: true });

    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: err.name, message: err.message },
        { status: err.statusCode }
      );
    }
    console.error("Verify OTP error:", err);
    return NextResponse.json(
      { error: "InternalServerError", message: "Failed to verify OTP." },
      { status: 500 }
    );
  }
}

