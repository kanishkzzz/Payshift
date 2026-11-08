"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TrackyBrandIcon from "@/components/TrackyBrandIcon";
import { AlertCircle, Loader2, ShieldCheck, Info, KeyRound } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    studentId: "",
    relation: "FATHER",
    preferredLang: "EN",
    otp: "",
  });
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSendOtp = async () => {
    if (!formData.phone || formData.phone.length < 10) {
      setError("Please provide a valid phone number (at least 10 digits).");
      return;
    }

    setError(null);
    setInfo(null);
    setSendingOtp(true);

    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: formData.phone }),
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpSent) {
      await handleSendOtp();
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          email: formData.email ? formData.email : undefined,
          studentId: formData.studentId ? formData.studentId : undefined,
          otp: formData.otp || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to create account");
      }

      // Successful registration: redirect to parent dues portal
      router.push("/parent/dues");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred during registration.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tracky-workspace min-h-screen flex items-center justify-center px-4 py-12">
      <div className="tracky-auth-card w-full max-w-lg bg-white/95 border border-white p-8 backdrop-blur-sm">
        <div className="text-center mb-6">
          <TrackyBrandIcon className="mx-auto mb-3 h-12 w-12 rounded-[11px] shadow-[0_5px_14px_rgba(84,112,255,.22)]" />
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Parent Account Registration</h1>
          <p className="text-sm text-slate-500 mt-1">
            Passwordless Registration via Phone OTP
          </p>
        </div>

        {/* Notice: Staff Restriction */}
        <div className="mb-6 p-3.5 rounded-lg bg-blue-50 border border-blue-200 flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-xs text-blue-800 leading-relaxed">
            <strong>Parent Access Only:</strong> Only parents may register a new account here. Staff accounts are provisioned exclusively by administration.
          </div>
        </div>

        {error && (
          <div className="mb-5 p-3.5 rounded-lg bg-red-50 border border-red-200 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="text-xs text-red-700 leading-snug">{error}</div>
          </div>
        )}

        {info && (
          <div className="mb-5 p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 flex items-start gap-3">
            <KeyRound className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-xs text-emerald-800 leading-snug">{info}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="name">
              Parent Full Name *
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g. Sunita Sharma"
              className="w-full px-3.5 py-2.5 rounded-lg tracky-auth-input border text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7164e8] text-sm transition"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="phone">
                Mobile Number *
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                required
                value={formData.phone}
                onChange={handleChange}
                placeholder="+919876543210"
                className="w-full px-3.5 py-2.5 rounded-lg tracky-auth-input border text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7164e8] text-sm transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="relation">
                Relationship *
              </label>
              <select
                id="relation"
                name="relation"
                value={formData.relation}
                onChange={handleChange}
                className="w-full px-3.5 py-2.5 rounded-lg tracky-auth-input border text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#7164e8] text-sm transition bg-white"
              >
                <option value="MOTHER">Mother</option>
                <option value="FATHER">Father</option>
                <option value="GUARDIAN">Guardian</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="preferredLang">Fee reminder language</label>
            <select id="preferredLang" name="preferredLang" value={formData.preferredLang} onChange={handleChange} className="w-full px-3.5 py-2.5 rounded-lg tracky-auth-input border text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#7164e8] text-sm transition bg-white">
              <option value="EN">English messages</option>
              <option value="HI">Hindi messages</option>
            </select>
            <p className="mt-1 text-xs leading-5 text-slate-500">This controls fee reminders sent by your institute, not the language of this website.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="studentId">
              Student ID / Roll No. <span className="text-slate-400 text-xs">(Optional, e.g. STU-0587)</span>
            </label>
            <input
              id="studentId"
              name="studentId"
              type="text"
              value={formData.studentId}
              onChange={handleChange}
              placeholder="STU-0587"
              className="w-full px-3.5 py-2.5 rounded-lg tracky-auth-input border text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7164e8] text-sm transition"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="email">
              Email Address <span className="text-slate-400 text-xs">(Optional for receipts)</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="sunita.sharma@example.com"
              className="w-full px-3.5 py-2.5 rounded-lg tracky-auth-input border text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7164e8] text-sm transition"
            />
          </div>

          {otpSent && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="otp">
                Enter 6-Digit OTP *
              </label>
              <input
                id="otp"
                name="otp"
                type="text"
                required
                maxLength={6}
                value={formData.otp}
                onChange={handleChange}
                placeholder="123456"
                className="w-full px-3.5 py-2.5 rounded-lg tracky-auth-input border text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7164e8] text-sm tracking-widest text-center font-mono font-semibold transition"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading || sendingOtp}
            className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg tracky-auth-submit text-white font-medium text-sm transition shadow-sm disabled:opacity-50"
          >
            {sendingOtp || loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {sendingOtp ? "Sending OTP..." : "Completing Registration..."}
              </>
            ) : !otpSent ? (
              <>
                <KeyRound className="w-4 h-4" />
                Send OTP & Continue
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                Verify OTP & Register
              </>
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-200 text-center">
          <p className="text-sm text-slate-600">
            Already registered?{" "}
            <Link
              href="/login"
              className="font-medium text-[#6558d9] hover:text-[#5145c4] underline underline-offset-4"
            >
              Sign In via OTP
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

