import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { AuthService } from "@/modules/auth/auth-service";
import { AuthError } from "@/modules/auth/types";
import { hashSessionToken } from "@/lib/auth/session";

describe("Tracky Auth Logic System (Passwordless Parents & Staff Password)", () => {
  const testPhone = "+919988776655";
  const testEmail = "parent.otp@example.com";

  // Clean up test records before and after tests
  const cleanup = async () => {
    await prisma.otpSession.deleteMany({
      where: { phone: testPhone },
    });

    const existingGuardian = await prisma.guardian.findFirst({
      where: { OR: [{ phone: testPhone }, { email: testEmail }] },
    });
    if (existingGuardian) {
      await prisma.session.deleteMany({
        where: { subjectType: "PARENT", subjectId: existingGuardian.id },
      });
      await prisma.consent.deleteMany({
        where: { guardianId: existingGuardian.id },
      });
      await prisma.paymentOrder.deleteMany({
        where: { guardianId: existingGuardian.id },
      });
      await prisma.guardian.delete({
        where: { id: existingGuardian.id },
      });
    }
  };

  beforeAll(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  describe("Staff Password Hashing & Verification", () => {
    it("should hash passwords using bcrypt for staff accounts", async () => {
      const hash = await hashPassword("myStaffSecret123");
      expect(hash).toBeDefined();
      expect(hash.startsWith("$2")).toBe(true);
    });

    it("should verify correct password and reject wrong password", async () => {
      const hash = await hashPassword("correctStaffPass");
      const isMatch = await verifyPassword("correctStaffPass", hash);
      const isWrong = await verifyPassword("wrongStaffPass", hash);

      expect(isMatch).toBe(true);
      expect(isWrong).toBe(false);
    });
  });

  describe("Parent Passwordless OTP Workflow", () => {
    it("should generate a 6-digit OTP for parents with 5-minute expiry", async () => {
      const res = await AuthService.sendOtp(testPhone);

      expect(res.success).toBe(true);
      expect(res.phone).toBe(testPhone);
      expect(res.devOtp).toBeDefined();
      expect(res.devOtp?.length).toBe(6);

      // Verify OTP session in DB
      const dbSession = await prisma.otpSession.findFirst({
        where: { phone: testPhone },
        orderBy: { createdAt: "desc" },
      });
      expect(dbSession).not.toBeNull();
      expect(dbSession?.verified).toBe(false);
      expect(dbSession?.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it("should reject invalid OTP verification codes", async () => {
      await expect(
        AuthService.verifyOtp(testPhone, "000000", { setCookie: false })
      ).rejects.toThrow(AuthError);
    });

    it("should verify correct OTP code", async () => {
      const sendRes = await AuthService.sendOtp(testPhone);
      const otpCode = sendRes.devOtp!;

      const verifyRes = await AuthService.verifyOtp(testPhone, otpCode, { setCookie: false });
      expect(verifyRes.success).toBe(true);
    });

    it("should enforce rate limiting: reject when more than 3 OTP requests in 15 minutes", async () => {
      const spamPhone = "+919999911111";
      // Request 1, 2, 3
      await AuthService.sendOtp(spamPhone);
      await AuthService.sendOtp(spamPhone);
      await AuthService.sendOtp(spamPhone);

      // 4th request must be rejected with 429
      await expect(AuthService.sendOtp(spamPhone)).rejects.toThrow(/Too many OTP requests/);

      // Cleanup
      await prisma.otpSession.deleteMany({ where: { phone: spamPhone } });
    });
  });

  describe("Parent Signup (Passwordless - No Password Stored)", () => {
    it("should allow a parent to create a new ID with OTP and no passwordHash", async () => {
      // 1. Send OTP
      const sendRes = await AuthService.sendOtp(testPhone);
      const otpCode = sendRes.devOtp!;

      // 2. Signup with OTP
      const result = await AuthService.signupParent(
        {
          name: "Sunita Sharma",
          phone: testPhone,
          email: testEmail,
          otp: otpCode,
          relation: "MOTHER",
          studentId: "STU-0587",
        },
        { setCookie: false }
      );

      expect(result.success).toBe(true);
      expect(result.subjectType).toBe("PARENT");
      expect(result.user.name).toBe("Sunita Sharma");
      expect(result.sessionToken).toBeDefined();

      // Verify DB record: Guardian must NOT have a passwordHash field in schema
      const dbGuardian = await prisma.guardian.findUnique({
        where: { id: result.user.id },
      });
      expect(dbGuardian).not.toBeNull();
      expect(dbGuardian?.name).toBe("Sunita Sharma");
      expect((dbGuardian as Record<string, unknown>).passwordHash).toBeUndefined();

      // Verify active session exists in sessions table
      const tokenHash = hashSessionToken(result.sessionToken);
      const dbSession = await prisma.session.findUnique({
        where: { tokenHash },
      });
      expect(dbSession).not.toBeNull();
      expect(dbSession?.subjectId).toBe(result.user.id);
      expect(dbSession?.subjectType).toBe("PARENT");
    });

    it("should reject signup if parent with phone already exists", async () => {
      await expect(
        AuthService.signupParent(
          {
            name: "Duplicate User",
            phone: testPhone,
            email: "other@example.com",
          },
          { setCookie: false }
        )
      ).rejects.toThrow(AuthError);
    });

    it("should reject signup if email belongs to existing staff member", async () => {
      await expect(
        AuthService.signupParent(
          {
            name: "Imposter",
            phone: "+911122334455",
            email: "admin@tracky.edu",
          },
          { setCookie: false }
        )
      ).rejects.toThrow(/already exists as staff/);
    });

    it("should reject signup if non-existent student ID is passed", async () => {
      await expect(
        AuthService.signupParent(
          {
            name: "Test Parent",
            phone: "+919999900000",
            studentId: "NON_EXISTENT_STUDENT_ID",
          },
          { setCookie: false }
        )
      ).rejects.toThrow(/not found/);
    });
  });

  describe("Staff Login (Email + Bcrypt Password)", () => {
    it("should login seeded staff user with email and password", async () => {
      const result = await AuthService.loginStaff(
        {
          email: "accounts@tracky.edu",
          password: "Staff@123",
        },
        { setCookie: false }
      );

      expect(result.success).toBe(true);
      expect(result.subjectType).toBe("STAFF");
      expect(result.user.name).toBe("Neha Verma (Accounts Lead)");
      if (result.user.subjectType === "STAFF") {
        expect(result.user.role).toBe("ACCOUNTS");
      }
    });

    it("should reject staff login with wrong password", async () => {
      await expect(
        AuthService.loginStaff(
          {
            email: "accounts@tracky.edu",
            password: "WrongStaffPassword",
          },
          { setCookie: false }
        )
      ).rejects.toThrow(AuthError);
    });

    it("should reject staff login for non-existent email", async () => {
      await expect(
        AuthService.loginStaff(
          {
            email: "nonexistent@tracky.edu",
            password: "SomePassword123",
          },
          { setCookie: false }
        )
      ).rejects.toThrow(AuthError);
    });
  });

  describe("Session Validation & Revocation", () => {
    it("should validate active session token and return user details", async () => {
      const staffLogin = await AuthService.loginStaff(
        {
          email: "admin@tracky.edu",
          password: "Staff@123",
        },
        { setCookie: false }
      );

      const sessionData = await AuthService.validateSession(staffLogin.sessionToken);
      expect(sessionData).not.toBeNull();
      expect(sessionData?.user.id).toBe(staffLogin.user.id);
      expect(sessionData?.subjectType).toBe("STAFF");
    });

    it("should revoke session on logout", async () => {
      const staffLogin = await AuthService.loginStaff(
        {
          email: "counsellor@tracky.edu",
          password: "Staff@123",
        },
        { setCookie: false }
      );

      const token = staffLogin.sessionToken;

      const before = await AuthService.validateSession(token);
      expect(before).not.toBeNull();

      await AuthService.logout(token);

      const after = await AuthService.validateSession(token);
      expect(after).toBeNull();
    });
  });
});
