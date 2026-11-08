"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TrackyBrandIcon from "@/components/TrackyBrandIcon";
import { AlertCircle, Loader2, UserCheck, Shield, KeyRound, Smartphone } from "lucide-react";

export default function LoginForm({ initialMode = "PARENT" }: { initialMode?: "PARENT" | "STAFF" }) {
  const router = useRouter();
  const [mode, setMode] = useState<"PARENT" | "STAFF">(initialMode);

  // Parent OTP state
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);

  // Staff Credentials state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSendingOtp(true);

    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to send OTP");
      }

      setOtpSent(true);
      if (data.devOtp) {
        setInfo(`Development OTP: ${data.devOtp}. No SMS was sent.`);
      } else {
        setInfo("SMS delivery is not configured for this demo, so a code will not arrive by text.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send OTP.");
    } finally {
      setSendingOtp(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      let payload;
      if (mode === "PARENT") {
        payload = { type: "PARENT", phone, otp };
      } else {
        payload = { type: "STAFF", email, password };
      }

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to sign in");
      }

      if (data.registered === false) {
        // Phone is verified; finish creating the parent profile without another OTP request.
        router.push(`/signup?phone=${encodeURIComponent(phone)}&verified=1`);
        return;
      }

      if (data.subjectType === "PARENT") {
        router.push("/parent/dues");
      } else if (data.user?.role === "COUNSELLOR") {
        router.push("/counsellor");
      } else {
        router.push("/dashboard");
      }
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred during login.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tracky-workspace min-h-screen flex items-center justify-center px-4 py-12">
      <div className="tracky-auth-card w-full max-w-md bg-white/95 border border-white p-8 backdrop-blur-sm">
        <div className="text-center mb-6">
          <TrackyBrandIcon className="mx-auto mb-3 h-12 w-12 rounded-[11px] shadow-[0_5px_14px_rgba(84,112,255,.22)]" />
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Sign in to Tracky</h1>
          <p className="text-sm text-slate-500 mt-1">
            Parent Fee Portal & Institute Operations
          </p>
        </div>

        {/* Role Mode Switcher */}
        <div className="flex rounded-lg bg-slate-100 p-1 mb-6 border border-slate-200">
          <button
            type="button"
            onClick={() => {
              setMode("PARENT");
              setError(null);
              setInfo(null);
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-md transition ${
              mode === "PARENT"
                ? "bg-white text-[#6558d9] shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Smartphone className="w-4 h-4" />
            Parent (Phone OTP)
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("STAFF");
              setError(null);
              setInfo(null);
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-md transition ${
              mode === "STAFF"
                ? "bg-white text-[#6558d9] shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Shield className="w-4 h-4" />
            Staff (Email)
          </button>
        </div>

        {error && (
          <div className="mb-5 p-3.5 rounded-lg bg-red-50 border border-red-200 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="text-xs text-red-700 leading-snug">{error}</div>
          </div>
        )}

        {info && (
          <div className="mb-5 p-3.5 rounded-lg bg-blue-50 border border-blue-200 flex items-start gap-3">
            <KeyRound className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-800 leading-snug">{info}</div>
          </div>
        )}

        {mode === "PARENT" ? (
          // Parent Passwordless Login (Phone OTP)
          <form onSubmit={otpSent ? handleLogin : handleSendOtp} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="phone">
                Mobile Number
              </label>
              <input
                id="phone"
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+910000000001"
                className="w-full px-3.5 py-2.5 rounded-lg tracky-auth-input border text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7164e8] text-sm transition"
              />
            </div>

            {otpSent && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="otp">
                  6-Digit OTP Code
                </label>
                <input
                  id="otp"
                  type="text"
                  required
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="123456"
                  className="w-full px-3.5 py-2.5 rounded-lg tracky-auth-input border text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7164e8] text-sm tracking-widest text-center font-mono font-semibold transition"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading || sendingOtp}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg tracky-auth-submit text-white font-medium text-sm transition shadow-sm disabled:opacity-50"
            >
              {sendingOtp || loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {sendingOtp ? "Sending OTP..." : "Verifying & Signing In..."}
                </>
              ) : otpSent ? (
                <>
                  <UserCheck className="w-4 h-4" />
                  Verify & Sign In
                </>
              ) : (
                <>
                  <KeyRound className="w-4 h-4" />
                  Send One-Time Password
                </>
              )}
            </button>

            {otpSent && (
              <button
                type="button"
                onClick={handleSendOtp}
                disabled={sendingOtp}
                className="w-full text-xs text-slate-500 hover:text-[#6558d9] text-center block pt-1"
              >
                Didn&apos;t receive code? Resend OTP
              </button>
            )}
          </form>
        ) : (
          // Staff Password Login
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="email">
                Staff Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="accounts@tracky.edu"
                className="w-full px-3.5 py-2.5 rounded-lg tracky-auth-input border text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7164e8] text-sm transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                className="w-full px-3.5 py-2.5 rounded-lg tracky-auth-input border text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7164e8] text-sm transition"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg tracky-auth-submit text-white font-medium text-sm transition shadow-sm disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <UserCheck className="w-4 h-4" />
                  Sign In as Staff
                </>
              )}
            </button>
          </form>
        )}

        <div className="mt-8 pt-6 border-t border-slate-200 text-center">
          <p className="text-sm text-slate-600">
            First time logging in as a parent?{" "}
            <Link
              href="/signup"
              className="font-medium text-[#6558d9] hover:text-[#5145c4] underline underline-offset-4"
            >
              Register Parent ID
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

