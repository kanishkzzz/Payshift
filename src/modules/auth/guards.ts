import { AuthService } from "./auth-service";
import { getSessionCookie } from "@/lib/auth/session";
import { AuthError, ParentAuthUser, StaffAuthUser } from "./types";
import { UserRole } from "@prisma/client";

/**
 * Extracts a session token from request headers or Next.js cookies.
 */
export async function extractSessionToken(req?: Request): Promise<string | undefined> {
  // 1. Check Authorization Bearer header
  if (req) {
    const authHeader = req.headers.get("authorization");
    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
      const token = authHeader.slice(7).trim();
      if (token) return token;
    }

    // 2. Check Cookie header directly from Request
    const rawCookies = req.headers.get("cookie");
    if (rawCookies) {
      const match = rawCookies.match(/(?:^|;\s*)tracky_session=([^;]+)/);
      if (match && match[1]) {
        return decodeURIComponent(match[1]);
      }
    }
  }

  // 3. Fallback to Next.js cookies()
  try {
    const cookieVal = await getSessionCookie();
    if (cookieVal) return cookieVal;
  } catch {
    // cookies() unavailable in non-request contexts
  }

  return undefined;
}

/**
 * Guard that enforces that the caller has an active Parent/Guardian session.
 * 
 * Never trust a guardian ID supplied by the client; always derive it from the verified session.
 * Throws 401 AuthError if unauthenticated or not a parent.
 */
export async function requireParent(req?: Request): Promise<{
  user: ParentAuthUser;
  sessionToken: string;
}> {
  const token = await extractSessionToken(req);
  if (!token) {
    throw new AuthError("Authentication required: Please sign in via OTP.", 401);
  }

  const authContext = await AuthService.validateSession(token);
  if (!authContext || authContext.subjectType !== "PARENT") {
    throw new AuthError("Unauthorized: Parent session required.", 401);
  }

  return {
    user: authContext.user as ParentAuthUser,
    sessionToken: token,
  };
}

/**
 * Guard that enforces that the caller has an active Staff user session
 * and optionally matches one of the required roles (e.g. ACCOUNTS, ADMIN).
 * 
 * Throws 401 if unauthenticated, or 403 if role is insufficient.
 */
export async function requireStaff(
  allowedRoles?: UserRole[],
  req?: Request
): Promise<{
  user: StaffAuthUser;
  sessionToken: string;
}> {
  const token = await extractSessionToken(req);
  if (!token) {
    throw new AuthError("Authentication required: Staff login required.", 401);
  }

  const authContext = await AuthService.validateSession(token);
  if (!authContext || authContext.subjectType !== "STAFF") {
    throw new AuthError("Unauthorized: Staff session required.", 401);
  }

  const staffUser = authContext.user as StaffAuthUser;

  if (allowedRoles && allowedRoles.length > 0) {
    if (!allowedRoles.includes(staffUser.role)) {
      throw new AuthError(
        `Forbidden: Role "${staffUser.role}" does not have sufficient privileges for this action.`,
        403
      );
    }
  }

  return {
    user: staffUser,
    sessionToken: token,
  };
}

