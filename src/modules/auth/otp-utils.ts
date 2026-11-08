import { randomInt } from "crypto";

export interface OtpEnvironment {
  NODE_ENV?: string;
  DEMO_PARENT_PHONE?: string;
  DEMO_PARENT_OTP?: string;
}

export class DemoOtpConfigurationError extends Error {
  constructor() {
    super("The demo parent OTP is not configured as a six-digit code.");
    this.name = "DemoOtpConfigurationError";
  }
}

/** Generate a fixed code only for one explicitly configured production demo account. */
export function generateOtpForPhone(
  phone: string,
  env: OtpEnvironment = process.env,
): { otp: string; isDemoOtp: boolean } {
  if (env.NODE_ENV === "test") return { otp: "123456", isDemoOtp: false };

  if (env.NODE_ENV === "production" && env.DEMO_PARENT_PHONE?.trim() === phone) {
    const demoOtp = env.DEMO_PARENT_OTP?.trim();
    if (!demoOtp || !/^\d{6}$/.test(demoOtp)) throw new DemoOtpConfigurationError();
    return { otp: demoOtp, isDemoOtp: true };
  }

  return {
    otp: randomInt(100000, 1000000).toString(),
    isDemoOtp: false,
  };
}

