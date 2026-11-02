import crypto from "crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE_NAME = "tracky_session";
export const DEFAULT_SESSION_DURATION_DAYS = 7;

/**
 * Generates a cryptographically secure random session token.
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Computes a SHA-256 hash of the session token for secure database storage.
 */
export function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Calculates session expiration date.
 */
export function getSessionExpiry(days = DEFAULT_SESSION_DURATION_DAYS): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/**
 * Sets the session cookie in the HTTP response headers.
 */
export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  try {
    const cookieStore = await cookies();
    cookieStore.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
  } catch {
    // Outside a Next.js request scope (e.g. in test suites/scripts)
  }
}

/**
 * Retrieves the session token from incoming request cookies.
 */
export async function getSessionCookie(): Promise<string | undefined> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get(SESSION_COOKIE_NAME)?.value;
  } catch {
    return undefined;
  }
}

/**
 * Clears the session cookie.
 */
export async function clearSessionCookie(): Promise<void> {
  try {
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE_NAME);
  } catch {
    // Outside a Next.js request scope (e.g. in test suites/scripts)
  }
}
