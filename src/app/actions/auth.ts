"use server";

import { AuthService } from "@/modules/auth/auth-service";
import { AuthError, SignupParentInput, LoginStaffInput } from "@/modules/auth/types";
import { redirect } from "next/navigation";

export interface ActionState {
  success?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export async function signupParentAction(
  _prevState: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const name = formData.get("name")?.toString() ?? "";
  const phone = formData.get("phone")?.toString() ?? "";
  const email = formData.get("email")?.toString() ?? "";
  const studentId = formData.get("studentId")?.toString() ?? "";
  const relation = formData.get("relation")?.toString() || "GUARDIAN";
  const otp = formData.get("otp")?.toString() ?? "";

  try {
    const input: SignupParentInput = {
      name,
      phone,
      otp: otp || undefined,
      email: email || undefined,
      studentId: studentId || undefined,
      relation,
      preferredLang: "EN",
    };

    await AuthService.signupParent(input, { setCookie: true });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return { error: err.message };
    }
    return { error: "An unexpected error occurred during signup." };
  }

  redirect("/parent/dues");
}

export async function loginStaffAction(
  _prevState: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const email = formData.get("email")?.toString() ?? "";
  const password = formData.get("password")?.toString() ?? "";

  try {
    const input: LoginStaffInput = {
      email,
      password,
    };

    await AuthService.loginStaff(input, { setCookie: true });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return { error: err.message };
    }
    return { error: "An unexpected error occurred during staff login." };
  }

  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await AuthService.logout();
  redirect("/login");
}
