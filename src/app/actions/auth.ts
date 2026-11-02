"use server";

import { AuthService } from "@/modules/auth/auth-service";
import { AuthError, SignupParentInput, LoginInput } from "@/modules/auth/types";
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
  const password = formData.get("password")?.toString() ?? "";
  const email = formData.get("email")?.toString() ?? "";
  const studentId = formData.get("studentId")?.toString() ?? "";
  const relation = formData.get("relation")?.toString() || "GUARDIAN";

  try {
    const input: SignupParentInput = {
      name,
      phone,
      password,
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

export async function loginAction(
  _prevState: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const identifier = formData.get("identifier")?.toString() ?? "";
  const password = formData.get("password")?.toString() ?? "";

  let result;
  try {
    const input: LoginInput = {
      identifier,
      password,
    };

    result = await AuthService.login(input, { setCookie: true });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return { error: err.message };
    }
    return { error: "An unexpected error occurred during login." };
  }

  if (result.subjectType === "PARENT") {
    redirect("/parent/dues");
  } else {
    redirect("/dashboard");
  }
}

export async function logoutAction(): Promise<void> {
  await AuthService.logout();
  redirect("/login");
}

