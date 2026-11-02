import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
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
  loginSchema,
  SignupParentInput,
  LoginInput,
  AuthResponse,
  AuthUser,
  ParentAuthUser,
  StaffAuthUser,
  AuthError,
} from "./types";
import { SubjectType } from "@prisma/client";

export class AuthService {
  /**
   * Registers a new Parent / Guardian account.
   * STRICT POLICY: Only parents can create new accounts. Staff accounts cannot be registered here.
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

    const { name, phone, password, relation, preferredLang } = parsed.data;
    const email = parsed.data.email ? parsed.data.email.toLowerCase().trim() : null;
    const studentId = parsed.data.studentId?.trim() || null;

    // 1. Check if email already belongs to a staff member
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

    // 2. Check if guardian already exists by phone or email
    const existingGuardian = await prisma.guardian.findFirst({
      where: {
        OR: [{ phone }, ...(email ? [{ email }] : [])],
      },
    });

    if (existingGuardian && existingGuardian.passwordHash) {
      throw new AuthError(
        "A parent account already exists with this phone number or email.",
        409
      );
    }

    // 3. Optional: Verify student exists if studentId is provided
    if (studentId) {
      const studentExists = await prisma.student.findUnique({
        where: { id: studentId },
      });
      if (!studentExists) {
        throw new AuthError(`Student ID "${studentId}" was not found.`, 404);
      }
    }

    // 4. Hash password
    const hashedPassword = await hashPassword(password);

    // 5. Create or update guardian
    let guardian;
    if (existingGuardian && !existingGuardian.passwordHash) {
      // Pre-enrolled guardian without a password: set credentials and activate
      guardian = await prisma.guardian.update({
        where: { id: existingGuardian.id },
        data: {
          name,
          email: email || existingGuardian.email,
          passwordHash: hashedPassword,
          relation: relation || existingGuardian.relation,
          preferredLang,
          studentId: studentId || existingGuardian.studentId,
        },
      });
    } else {
      // Create new guardian
      guardian = await prisma.guardian.create({
        data: {
          name,
          phone,
          email,
          passwordHash: hashedPassword,
          relation,
          preferredLang,
          studentId,
        },
      });
    }

    // 6. Create session
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
   * Universal Login: Authenticates Parent or Staff credentials.
   * Checks guardian table first, then staff user table.
   */
  static async login(
    rawInput: LoginInput,
    options: { setCookie?: boolean } = { setCookie: true }
  ): Promise<AuthResponse> {
    const parsed = loginSchema.safeParse(rawInput);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join(", ");
      throw new AuthError(message, 400);
    }

    const { identifier, password } = parsed.data;
    const normalizedIdentifier = identifier.trim();
    const normalizedEmail = identifier.toLowerCase().trim();

    // 1. Check Guardians table (Parent login via phone or email)
    const guardian = await prisma.guardian.findFirst({
      where: {
        OR: [
          { phone: normalizedIdentifier },
          { email: normalizedEmail },
        ],
      },
    });

    if (guardian) {
      if (!guardian.passwordHash) {
        throw new AuthError(
          "Parent account has not set a password yet. Please complete sign up first.",
          400
        );
      }

      const isValid = await verifyPassword(password, guardian.passwordHash);
      if (!isValid) {
        throw new AuthError("Invalid phone/email or password.", 401);
      }

      // Create session for Parent
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

    // 2. Check Staff Users table (Staff login via email)
    const staff = await prisma.user.findUnique({
      where: {
        email: normalizedEmail,
      },
    });

    if (staff) {
      const isValid = await verifyPassword(password, staff.passwordHash);
      if (!isValid) {
        throw new AuthError("Invalid email or password.", 401);
      }

      // Create session for Staff
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

    // 3. User not found in either table
    throw new AuthError("Invalid credentials.", 401);
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
      // Automatically clean up expired session
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
