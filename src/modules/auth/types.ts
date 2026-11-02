import { z } from "zod";
import { SubjectType, UserRole, PreferredLang } from "@prisma/client";

export const signupParentSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  phone: z
    .string()
    .trim()
    .min(10, "Phone number must be at least 10 digits")
    .max(15, "Phone number is too long"),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(100, "Password is too long"),
  email: z.string().trim().email("Invalid email address").optional().or(z.literal("")),
  studentId: z.string().trim().optional().or(z.literal("")),
  relation: z.string().trim().optional().default("GUARDIAN"),
  preferredLang: z.nativeEnum(PreferredLang).optional().default(PreferredLang.EN),
});

export type SignupParentInput = z.input<typeof signupParentSchema>;

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Email or phone number is required"),
  password: z.string().min(1, "Password is required"),
});

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

export class AuthError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
  }
}
