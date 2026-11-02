import { NextRequest, NextResponse } from "next/server";
import { AuthService } from "@/modules/auth/auth-service";
import { AuthError } from "@/modules/auth/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await AuthService.login(body, { setCookie: true });

    return NextResponse.json(
      {
        success: true,
        message: "Login successful",
        subjectType: result.subjectType,
        user: result.user,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: err.name, message: err.message },
        { status: err.statusCode }
      );
    }

    console.error("Login error:", err);
    return NextResponse.json(
      { error: "InternalServerError", message: "An unexpected error occurred during login." },
      { status: 500 }
    );
  }
}

