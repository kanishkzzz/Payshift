import { NextResponse } from "next/server";
import { AuthService } from "@/modules/auth/auth-service";

export async function POST() {
  try {
    await AuthService.logout();
    return NextResponse.json({ success: true, message: "Logged out successfully" });
  } catch (err: unknown) {
    console.error("Logout error:", err);
    return NextResponse.json(
      { error: "InternalServerError", message: "Failed to log out." },
      { status: 500 }
    );
  }
}

