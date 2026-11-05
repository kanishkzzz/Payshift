"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogIn, AlertCircle, Loader2, UserCheck, Shield, KeyRound, Smartphone } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"PARENT" | "STAFF">("PARENT");

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
        setInfo(`Test Mode: OTP sent! Your code is ${data.devOtp}`);
      } else {
        setInfo("A 6-digit OTP has been sent to your phone number.");
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
        // Unregistered parent with valid OTP
        router.push(`/signup?phone=${encodeURIComponent(phone)}`);
        return;
      }

      if (data.subjectType === "PARENT") {
        router.push("/parent/dues");
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
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md bg-white rounded-xl shadow-md border border-slate-200 p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 text-blue-600 mb-3">
            <LogIn className="w-6 h-6" />
          </div>
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
                ? "bg-white text-blue-600 shadow-sm"
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
                ? "bg-white text-blue-600 shadow-sm"
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
                placeholder="+919876543210"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm transition"
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
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm tracking-widest text-center font-mono font-semibold transition"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading || sendingOtp}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition shadow-sm disabled:opacity-50"
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
                className="w-full text-xs text-slate-500 hover:text-blue-600 text-center block pt-1"
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
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm transition"
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
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm transition"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition shadow-sm disabled:opacity-50"
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
              className="font-medium text-blue-600 hover:text-blue-700 underline underline-offset-4"
            >
              Register Parent ID
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
