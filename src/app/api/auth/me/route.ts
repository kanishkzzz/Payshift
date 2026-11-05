import { NextResponse } from "next/server";
import { AuthService } from "@/modules/auth/auth-service";

export async function GET() {
  try {
    const user = await AuthService.getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { authenticated: false, user: null },
        { status: 401 }
      );
    }

    return NextResponse.json({ authenticated: true, user });
  } catch (err: unknown) {
    console.error("Auth me check error:", err);
    return NextResponse.json(
      { error: "InternalServerError", message: "Failed to fetch user session." },
      { status: 500 }
    );
  }
}
