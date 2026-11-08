import { describe, expect, it } from "vitest";
import { DemoOtpConfigurationError, generateOtpForPhone } from "@/modules/auth/otp-utils";

describe("reviewer demo OTP", () => {
  it("uses a fixed code only for the configured production demo phone", () => {
    expect(generateOtpForPhone("+910000000001", {
      NODE_ENV: "production",
      DEMO_PARENT_PHONE: "+910000000001",
      DEMO_PARENT_OTP: "246810",
    })).toEqual({ otp: "246810", isDemoOtp: true });
  });

  it("uses a generated code for other production phone numbers", () => {
    const result = generateOtpForPhone("+910000000002", {
      NODE_ENV: "production",
      DEMO_PARENT_PHONE: "+910000000001",
      DEMO_PARENT_OTP: "246810",
    });
    expect(result.isDemoOtp).toBe(false);
    expect(result.otp).toMatch(/^\d{6}$/);
  });

  it("rejects invalid fixed codes", () => {
    expect(() => generateOtpForPhone("+910000000001", {
      NODE_ENV: "production",
      DEMO_PARENT_PHONE: "+910000000001",
      DEMO_PARENT_OTP: "bad",
    })).toThrow(DemoOtpConfigurationError);
  });

  it("keeps the deterministic test OTP", () => {
    expect(generateOtpForPhone("+919988776655", { NODE_ENV: "test" })).toEqual({
      otp: "123456",
      isDemoOtp: false,
    });
  });
});
