import crypto from "crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE_NAME = "tracky_session";
export const DEFAULT_SESSION_DURATION_DAYS = 7;

/**
 * Checks whether an error is a known Next.js context restriction
 * (e.g. attempting to mutate cookies in a Server Component, running during prerender, or running in Vitest/CLI).
 */
function isExpectedContextError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("cookies can only be modified")) return true;
    if (msg.includes("outside a request scope") || msg.includes("request store")) return true;
    if (msg.includes("during prerendering") || msg.includes("prerender")) return true;
    if ((err as { digest?: string }).digest === "HANGING_PROMISE_REJECTION") return true;
  }
  return false;
}

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
 * Catches only known execution context limitations and logs/rethrows unexpected failures.
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
  } catch (err: unknown) {
    if (isExpectedContextError(err)) {
      console.warn(
        "[setSessionCookie] Cannot set cookie in current execution context:",
        (err as Error).message
      );
      return;
    }
    console.error("[setSessionCookie] Unexpected error setting session cookie:", err);
    throw err;
  }
}

/**
 * Retrieves the session token from incoming request cookies.
 */
export async function getSessionCookie(): Promise<string | undefined> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get(SESSION_COOKIE_NAME)?.value;
  } catch (err: unknown) {
    if (isExpectedContextError(err)) {
      return undefined;
    }
    console.error("[getSessionCookie] Unexpected error reading session cookie:", err);
    throw err;
  }
}

/**
 * Clears the session cookie.
 */
export async function clearSessionCookie(): Promise<void> {
  try {
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE_NAME);
  } catch (err: unknown) {
    if (isExpectedContextError(err)) {
      console.warn(
        "[clearSessionCookie] Cannot clear cookie in current execution context:",
        (err as Error).message
      );
      return;
    }
    console.error("[clearSessionCookie] Unexpected error clearing session cookie:", err);
    throw err;
  }
}
