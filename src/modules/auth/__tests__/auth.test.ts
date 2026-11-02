import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { AuthService } from "@/modules/auth/auth-service";
import { AuthError } from "@/modules/auth/types";
import { hashSessionToken } from "@/lib/auth/session";

describe("Tracky Auth Logic System", () => {
  const testPhone = "+919988776655";
  const testEmail = "parent.test@example.com";
  const testPassword = "SecurePassword@123";

  // Clean up test records before and after tests
  const cleanup = async () => {
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

  describe("Password Hashing & Verification", () => {
    it("should hash passwords using bcrypt", async () => {
      const hash = await hashPassword("mySecretPassword");
      expect(hash).toBeDefined();
      expect(hash).not.toBe("mySecretPassword");
      expect(hash.startsWith("$2")).toBe(true);
    });

    it("should verify correct password and reject wrong password", async () => {
      const hash = await hashPassword("correctPassword123");
      const isMatch = await verifyPassword("correctPassword123", hash);
      const isWrong = await verifyPassword("wrongPassword", hash);

      expect(isMatch).toBe(true);
      expect(isWrong).toBe(false);
    });

    it("should reject passwords shorter than 6 characters", async () => {
      await expect(hashPassword("12345")).rejects.toThrow();
    });
  });

  describe("Parent Signup", () => {
    it("should allow a parent to create a new ID with hashed password and session", async () => {
      const result = await AuthService.signupParent(
        {
          name: "Sunita Sharma",
          phone: testPhone,
          email: testEmail,
          password: testPassword,
          relation: "MOTHER",
          studentId: "STU-0587",
        },
        { setCookie: false }
      );

      expect(result.success).toBe(true);
      expect(result.subjectType).toBe("PARENT");
      expect(result.user.name).toBe("Sunita Sharma");
      if (result.user.subjectType === "PARENT") {
        expect(result.user.phone).toBe(testPhone);
      }
      expect(result.sessionToken).toBeDefined();

      // Verify the record in DB has a hashed password
      const dbGuardian = await prisma.guardian.findUnique({
        where: { id: result.user.id },
      });
      expect(dbGuardian).not.toBeNull();
      expect(dbGuardian?.passwordHash).toBeDefined();
      expect(dbGuardian?.passwordHash).not.toBe(testPassword);
      expect(dbGuardian?.passwordHash?.startsWith("$2")).toBe(true);

      // Verify session exists in sessions table
      const tokenHash = hashSessionToken(result.sessionToken);
      const dbSession = await prisma.session.findUnique({
        where: { tokenHash },
      });
      expect(dbSession).not.toBeNull();
      expect(dbSession?.subjectId).toBe(result.user.id);
      expect(dbSession?.subjectType).toBe("PARENT");
      expect(dbSession?.revokedAt).toBeNull();
    });

    it("should reject signup if parent with phone or email already exists", async () => {
      await expect(
        AuthService.signupParent(
          {
            name: "Duplicate User",
            phone: testPhone,
            email: testEmail,
            password: "AnotherPassword@123",
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
            email: "admin@tracky.edu", // belongs to seeded staff admin
            password: "Password123!",
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
            password: "ValidPassword@123",
            studentId: "NON_EXISTENT_STUDENT_ID",
          },
          { setCookie: false }
        )
      ).rejects.toThrow(/not found/);
    });
  });

  describe("Login System (Checking Hash against Pass)", () => {
    it("should login parent using phone number and correct password", async () => {
      const result = await AuthService.login(
        {
          identifier: testPhone,
          password: testPassword,
        },
        { setCookie: false }
      );

      expect(result.success).toBe(true);
      expect(result.subjectType).toBe("PARENT");
      expect(result.user.name).toBe("Sunita Sharma");
      expect(result.sessionToken).toBeDefined();
    });

    it("should login parent using email and correct password", async () => {
      const result = await AuthService.login(
        {
          identifier: testEmail,
          password: testPassword,
        },
        { setCookie: false }
      );

      expect(result.success).toBe(true);
      expect(result.subjectType).toBe("PARENT");
      expect(result.user.id).toBeDefined();
    });

    it("should reject parent login with wrong password", async () => {
      await expect(
        AuthService.login(
          {
            identifier: testPhone,
            password: "WrongPassword@123",
          },
          { setCookie: false }
        )
      ).rejects.toThrow(AuthError);
    });

    it("should login seeded staff user with email and password", async () => {
      const result = await AuthService.login(
        {
          identifier: "accounts@tracky.edu",
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
        AuthService.login(
          {
            identifier: "accounts@tracky.edu",
            password: "WrongStaffPassword",
          },
          { setCookie: false }
        )
      ).rejects.toThrow(AuthError);
    });

    it("should reject login for non-existent identifier", async () => {
      await expect(
        AuthService.login(
          {
            identifier: "nonexistent@example.com",
            password: "SomePassword123",
          },
          { setCookie: false }
        )
      ).rejects.toThrow(AuthError);
    });
  });

  describe("Session Validation & Revocation", () => {
    it("should validate active session token and return user details", async () => {
      const loginRes = await AuthService.login(
        {
          identifier: testPhone,
          password: testPassword,
        },
        { setCookie: false }
      );

      const sessionData = await AuthService.validateSession(loginRes.sessionToken);
      expect(sessionData).not.toBeNull();
      expect(sessionData?.user.id).toBe(loginRes.user.id);
      expect(sessionData?.subjectType).toBe("PARENT");
    });

    it("should revoke session on logout", async () => {
      const loginRes = await AuthService.login(
        {
          identifier: testPhone,
          password: testPassword,
        },
        { setCookie: false }
      );

      const token = loginRes.sessionToken;

      // Validate before logout
      const before = await AuthService.validateSession(token);
      expect(before).not.toBeNull();

      // Logout / revoke
      await AuthService.logout(token);

      // Validate after logout -> should return null
      const after = await AuthService.validateSession(token);
      expect(after).toBeNull();
    });
  });
});
