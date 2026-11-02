import { NextRequest, NextResponse } from "next/server";
import { AuthService } from "@/modules/auth/auth-service";
import { AuthError } from "@/modules/auth/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Explicit security check: Prevent any attempt to specify a staff role
    if (body.role && body.role !== "PARENT") {
      return NextResponse.json(
        {
          error: "Forbidden",
          message: "Staff registration is disabled. Only parent accounts can be created.",
        },
        { status: 403 }
      );
    }

    const result = await AuthService.signupParent(body, { setCookie: true });

    return NextResponse.json(
      {
        success: true,
        message: "Parent account created successfully",
        user: result.user,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: err.name, message: err.message },
        { status: err.statusCode }
      );
    }

    console.error("Signup error:", err);
    return NextResponse.json(
      { error: "InternalServerError", message: "An unexpected error occurred during signup." },
      { status: 500 }
    );
  }
}

