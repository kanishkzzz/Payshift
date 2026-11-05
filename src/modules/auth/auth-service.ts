import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import {
  generateSessionToken,
  hashSessionToken,
  getSessionExpiry,
  setSessionCookie,
  getSessionCookie,
  clearSessionCookie,
} from "@/lib/auth/session";
import {
  signupParentSchema,
  sendOtpSchema,
  verifyOtpSchema,
  loginStaffSchema,
  loginSchema,
  SignupParentInput,
  LoginInput,
  AuthResponse,
  OtpResponse,
  AuthUser,
  ParentAuthUser,
  StaffAuthUser,
  AuthError,
} from "./types";
import { SubjectType } from "@prisma/client";

function hashOtp(otp: string): string {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

export class AuthService {
  /**
   * Generates and dispatches a 5-minute phone OTP for Parents.
   * Enforces rate limiting: Maximum 3 attempts per 15 minutes.
   */
  static async sendOtp(phoneInput: string): Promise<OtpResponse> {
    const parsed = sendOtpSchema.safeParse({ phone: phoneInput });
    if (!parsed.success) {
      throw new AuthError(parsed.error.issues[0].message, 400);
    }
    const phone = parsed.data.phone;

    // 1. Rate limiting: Check attempts in trailing 15 minutes
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const recentRequestsCount = await prisma.otpSession.count({
      where: {
        phone,
        createdAt: { gte: fifteenMinutesAgo },
      },
    });

    if (recentRequestsCount >= 3) {
      throw new AuthError(
        "Too many OTP requests. For security, please wait 15 minutes before trying again.",
        429
      );
    }

    // 2. Generate 6-digit OTP code (mockable in dev/test)
    const otp =
      process.env.NODE_ENV === "test"
        ? "123456"
        : Math.floor(100000 + Math.random() * 900000).toString();

    const otpHash = hashOtp(otp);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes validity

    // 3. Persist OTP session
    await prisma.otpSession.create({
      data: {
        phone,
        otpHash,
        expiresAt,
        attempts: 0,
        verified: false,
      },
    });

    // In dev / test mode, we log or return the OTP for developer convenience
    if (process.env.NODE_ENV !== "production") {
      console.log(`[DEV OTP] Generated OTP for ${phone}: ${otp}`);
    }

    const guardianExists = await prisma.guardian.findFirst({
      where: { phone },
    });

    return {
      success: true,
      message: "One-time password (OTP) sent successfully.",
      phone,
      devOtp: process.env.NODE_ENV !== "production" ? otp : undefined,
      registered: Boolean(guardianExists),
    };
  }

  /**
   * Verifies a Parent's Phone OTP.
   * If the guardian is already registered, authenticates them and issues a session.
   */
  static async verifyOtp(
    phoneInput: string,
    otpInput: string,
    options: { setCookie?: boolean } = { setCookie: true }
  ): Promise<AuthResponse | OtpResponse> {
    const parsed = verifyOtpSchema.safeParse({ phone: phoneInput, otp: otpInput });
    if (!parsed.success) {
      throw new AuthError(parsed.error.issues[0].message, 400);
    }
    const { phone, otp } = parsed.data;

    // 1. Look for the latest active OTP session
    const otpSession = await prisma.otpSession.findFirst({
      where: {
        phone,
        expiresAt: { gt: new Date() },
        verified: false,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!otpSession) {
      throw new AuthError("OTP has expired or is invalid. Please request a new code.", 400);
    }

    // 2. Check maximum verification attempts per session (3 attempts)
    if (otpSession.attempts >= 3) {
      throw new AuthError(
        "Maximum verification attempts exceeded. Please request a new OTP.",
        429
      );
    }

    // 3. Compare hash
    const candidateHash = hashOtp(otp);
    if (candidateHash !== otpSession.otpHash) {
      await prisma.otpSession.update({
        where: { id: otpSession.id },
        data: { attempts: { increment: 1 } },
      });
      throw new AuthError("Invalid verification code. Please check and try again.", 401);
    }

    // 4. Mark session as verified
    await prisma.otpSession.update({
      where: { id: otpSession.id },
      data: { verified: true },
    });

    // 5. Check if Guardian exists in the system
    const guardian = await prisma.guardian.findFirst({
      where: { phone },
    });

    if (!guardian) {
      // OTP is valid, but parent still needs to fill in their name / child linkage
      return {
        success: true,
        message: "OTP verified successfully. Please complete parent registration.",
        phone,
        registered: false,
      };
    }

    // 6. Registered guardian found: Issue parent session immediately
    const rawToken = generateSessionToken();
    const tokenHash = hashSessionToken(rawToken);
    const expiresAt = getSessionExpiry();

    await prisma.session.create({
      data: {
        subjectType: SubjectType.PARENT,
        subjectId: guardian.id,
        tokenHash,
        expiresAt,
      },
    });

    if (options.setCookie) {
      await setSessionCookie(rawToken, expiresAt);
    }

    const user: ParentAuthUser = {
      id: guardian.id,
      name: guardian.name,
      phone: guardian.phone,
      email: guardian.email,
      relation: guardian.relation,
      studentId: guardian.studentId,
      preferredLang: guardian.preferredLang,
      subjectType: "PARENT",
    };

    return {
      success: true,
      subjectType: SubjectType.PARENT,
      user,
      sessionToken: rawToken,
      expiresAt,
    };
  }

  /**
   * Registers a new Parent / Guardian account (Passwordless).
   * STRICT POLICY: Only parents can create new accounts. Staff cannot register here.
   */
  static async signupParent(
    rawInput: SignupParentInput,
    options: { setCookie?: boolean } = { setCookie: true }
  ): Promise<AuthResponse> {
    const parsed = signupParentSchema.safeParse(rawInput);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join(", ");
      throw new AuthError(message, 400);
    }

    const { name, phone, relation, preferredLang, otp } = parsed.data;
    const email = parsed.data.email ? parsed.data.email.toLowerCase().trim() : null;
    const studentId = parsed.data.studentId?.trim() || null;

    // 1. If OTP provided, verify it first
    if (otp) {
      const otpSession = await prisma.otpSession.findFirst({
        where: {
          phone,
          expiresAt: { gt: new Date() },
          otpHash: hashOtp(otp),
        },
        orderBy: { createdAt: "desc" },
      });

      if (!otpSession) {
        throw new AuthError("Invalid or expired OTP. Please verify your phone number.", 400);
      }

      await prisma.otpSession.update({
        where: { id: otpSession.id },
        data: { verified: true },
      });
    }

    // 2. Prevent conflict with staff accounts
    if (email) {
      const existingStaff = await prisma.user.findUnique({
        where: { email },
      });
      if (existingStaff) {
        throw new AuthError(
          "An account with this email already exists as staff. Staff registration is disabled.",
          409
        );
      }
    }

    // 3. Check if guardian already exists by phone
    const existingGuardian = await prisma.guardian.findFirst({
      where: {
        OR: [{ phone }, ...(email ? [{ email }] : [])],
      },
    });

    if (existingGuardian) {
      throw new AuthError(
        "A parent account is already registered with this phone number or email.",
        409
      );
    }

    // 4. Optional: Verify student exists if studentId is provided
    if (studentId) {
      const studentExists = await prisma.student.findUnique({
        where: { id: studentId },
      });
      if (!studentExists) {
        throw new AuthError(`Student ID "${studentId}" was not found.`, 404);
      }
    }

    // 5. Create Guardian record (passwordless!)
    const guardian = await prisma.guardian.create({
      data: {
        name,
        phone,
        email,
        relation: relation || "GUARDIAN",
        preferredLang: preferredLang || "EN",
        studentId,
      },
    });

    // 6. Issue parent session
    const rawToken = generateSessionToken();
    const tokenHash = hashSessionToken(rawToken);
    const expiresAt = getSessionExpiry();

    await prisma.session.create({
      data: {
        subjectType: SubjectType.PARENT,
        subjectId: guardian.id,
        tokenHash,
        expiresAt,
      },
    });

    if (options.setCookie) {
      await setSessionCookie(rawToken, expiresAt);
    }

    const authUser: ParentAuthUser = {
      id: guardian.id,
      name: guardian.name,
      phone: guardian.phone,
      email: guardian.email,
      relation: guardian.relation,
      studentId: guardian.studentId,
      preferredLang: guardian.preferredLang,
      subjectType: "PARENT",
    };

    return {
      success: true,
      subjectType: SubjectType.PARENT,
      user: authUser,
      sessionToken: rawToken,
      expiresAt,
    };
  }

  /**
   * Staff Login: Authenticates staff accounts using Email + bcrypt password hash.
   */
  static async loginStaff(
    rawInput: { email: string; password: string },
    options: { setCookie?: boolean } = { setCookie: true }
  ): Promise<AuthResponse> {
    const parsed = loginStaffSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new AuthError(parsed.error.issues[0].message, 400);
    }

    const { email, password } = parsed.data;
    const normalizedEmail = email.toLowerCase().trim();

    const staff = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!staff) {
      throw new AuthError("Invalid email or password.", 401);
    }

    const isValid = await verifyPassword(password, staff.passwordHash);
    if (!isValid) {
      throw new AuthError("Invalid email or password.", 401);
    }

    const rawToken = generateSessionToken();
    const tokenHash = hashSessionToken(rawToken);
    const expiresAt = getSessionExpiry();

    await prisma.session.create({
      data: {
        subjectType: SubjectType.STAFF,
        subjectId: staff.id,
        tokenHash,
        expiresAt,
      },
    });

    if (options.setCookie) {
      await setSessionCookie(rawToken, expiresAt);
    }

    const user: StaffAuthUser = {
      id: staff.id,
      name: staff.name,
      email: staff.email,
      role: staff.role,
      centreId: staff.centreId,
      subjectType: "STAFF",
    };

    return {
      success: true,
      subjectType: SubjectType.STAFF,
      user,
      sessionToken: rawToken,
      expiresAt,
    };
  }

  /**
   * Universal Login dispatcher:
   * - If OTP is supplied with a phone: verifies Parent OTP.
   * - If email + password is supplied: verifies Staff credentials.
   */
  static async login(
    rawInput: LoginInput,
    options: { setCookie?: boolean } = { setCookie: true }
  ): Promise<AuthResponse | OtpResponse> {
    const parsed = loginSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new AuthError("Invalid login payload.", 400);
    }

    const data = parsed.data;

    if (data.type === "STAFF") {
      return this.loginStaff({ email: data.email, password: data.password }, options);
    }

    if (data.type === "PARENT") {
      return this.verifyOtp(data.phone, data.otp, options);
    }

    // Fallback detection
    if (data.otp && data.identifier) {
      return this.verifyOtp(data.identifier, data.otp, options);
    }

    if (data.password && data.identifier) {
      return this.loginStaff(
        { email: data.identifier, password: data.password },
        options
      );
    }

    throw new AuthError("Please provide phone & OTP for parents, or email & password for staff.", 400);
  }

  /**
   * Validates a raw session token and returns the authenticated user context.
   */
  static async validateSession(
    rawToken: string
  ): Promise<{
    user: AuthUser;
    subjectType: SubjectType;
    session: { id: string; expiresAt: Date; subjectType: SubjectType };
  } | null> {
    if (!rawToken) return null;

    const tokenHash = hashSessionToken(rawToken);
    const session = await prisma.session.findUnique({
      where: { tokenHash },
    });

    if (!session) return null;
    if (session.revokedAt !== null) return null;
    if (session.expiresAt < new Date()) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => null);
      return null;
    }

    if (session.subjectType === SubjectType.PARENT) {
      const guardian = await prisma.guardian.findUnique({
        where: { id: session.subjectId },
      });
      if (!guardian) return null;

      const user: ParentAuthUser = {
        id: guardian.id,
        name: guardian.name,
        phone: guardian.phone,
        email: guardian.email,
        relation: guardian.relation,
        studentId: guardian.studentId,
        preferredLang: guardian.preferredLang,
        subjectType: "PARENT",
      };

      return {
        user,
        subjectType: session.subjectType,
        session: {
          id: session.id,
          expiresAt: session.expiresAt,
          subjectType: session.subjectType,
        },
      };
    }

    if (session.subjectType === SubjectType.STAFF) {
      const staff = await prisma.user.findUnique({
        where: { id: session.subjectId },
      });
      if (!staff) return null;

      const user: StaffAuthUser = {
        id: staff.id,
        name: staff.name,
        email: staff.email,
        role: staff.role,
        centreId: staff.centreId,
        subjectType: "STAFF",
      };

      return {
        user,
        subjectType: session.subjectType,
        session: {
          id: session.id,
          expiresAt: session.expiresAt,
          subjectType: session.subjectType,
        },
      };
    }

    return null;
  }

  /**
   * Retrieves the current user from the session cookie.
   */
  static async getCurrentUser(): Promise<AuthUser | null> {
    const token = await getSessionCookie();
    if (!token) return null;

    const authContext = await AuthService.validateSession(token);
    return authContext?.user ?? null;
  }

  /**
   * Logs out the current session and clears the cookie.
   */
  static async logout(rawToken?: string): Promise<{ success: boolean }> {
    const token = rawToken || (await getSessionCookie());
    if (token) {
      const tokenHash = hashSessionToken(token);
      await prisma.session
        .update({
          where: { tokenHash },
          data: { revokedAt: new Date() },
        })
        .catch(() => null);
    }

    await clearSessionCookie();
    return { success: true };
  }
}
