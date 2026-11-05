import { z } from "zod";
import { SubjectType, UserRole, PreferredLang } from "@prisma/client";

// Parent Registration (Passwordless)
export const signupParentSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  phone: z
    .string()
    .trim()
    .min(10, "Phone number must be at least 10 digits")
    .max(15, "Phone number is too long"),
  otp: z.string().trim().length(6, "OTP must be 6 digits").optional(),
  email: z.string().trim().email("Invalid email address").optional().or(z.literal("")),
  studentId: z.string().trim().optional().or(z.literal("")),
  relation: z.string().trim().optional().default("GUARDIAN"),
  preferredLang: z.nativeEnum(PreferredLang).optional().default(PreferredLang.EN),
});

export type SignupParentInput = z.input<typeof signupParentSchema>;

// Parent Send OTP
export const sendOtpSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(10, "Phone number must be at least 10 digits")
    .max(15, "Phone number is too long"),
});

export type SendOtpInput = z.infer<typeof sendOtpSchema>;

// Parent Verify OTP
export const verifyOtpSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(10, "Phone number must be at least 10 digits"),
  otp: z.string().trim().length(6, "OTP must be 6 digits"),
});

export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

// Staff Login (Email + Password)
export const loginStaffSchema = z.object({
  email: z.string().trim().email("Valid staff email is required"),
  password: z.string().min(1, "Password is required"),
});

export type LoginStaffInput = z.infer<typeof loginStaffSchema>;

// Universal Login Schema
export const loginSchema = z.union([
  z.object({
    type: z.literal("STAFF"),
    email: z.string().trim().email(),
    password: z.string().min(1),
  }),
  z.object({
    type: z.literal("PARENT"),
    phone: z.string().trim().min(10),
    otp: z.string().trim().length(6),
  }),
  // Fallback for simple identifier/password or phone/otp submissions
  z.object({
    type: z.undefined(),
    identifier: z.string().trim().min(1),
    password: z.string().optional(),
    otp: z.string().optional(),
  }),
]);

export type LoginInput = z.infer<typeof loginSchema>;

export interface ParentAuthUser {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  relation: string;
  studentId: string | null;
  preferredLang: PreferredLang;
  subjectType: "PARENT";
}

export interface StaffAuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  centreId: string | null;
  subjectType: "STAFF";
}

export type AuthUser = ParentAuthUser | StaffAuthUser;

export interface AuthSessionData {
  id: string;
  subjectType: SubjectType;
  subjectId: string;
  expiresAt: Date;
}

export interface AuthResponse {
  success: boolean;
  subjectType: SubjectType;
  user: AuthUser;
  sessionToken: string;
  expiresAt: Date;
}

export interface OtpResponse {
  success: boolean;
  message: string;
  phone: string;
  devOtp?: string;
  registered?: boolean;
}

export class AuthError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
  }
}
