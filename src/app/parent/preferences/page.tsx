"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Languages, LoaderCircle, Save, ShieldCheck } from "lucide-react";
import { PortalError, PortalLoading, PortalShell, usePortalSession } from "@/components/portal/PortalShell";

type Language = "EN" | "HI";

export default function ParentPreferencesPage() {
  const router = useRouter();
  const { user, loading: sessionLoading } = usePortalSession();
  const [language, setLanguage] = useState<Language>("EN");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (sessionLoading || !user) return;
    if (user.subjectType !== "PARENT") { router.replace(user.role === "COUNSELLOR" ? "/counsellor" : "/dashboard"); return; }
    let active = true;
    fetch("/api/parent/preferences", { cache: "no-store" }).then(async (response) => {
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? "Could not load preferences.");
      if (active) setLanguage(payload.preferredLang === "HI" ? "HI" : "EN");
    }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load preferences."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sessionLoading, user, router]);

  async function save() {
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/parent/preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preferredLang: language }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? "Could not save preferences.");
      setNotice(`Fee reminders will be sent in ${payload.preferredLang === "HI" ? "Hindi" : "English"}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save preferences."); }
    finally { setSaving(false); }
  }

  if (sessionLoading || !user || user.subjectType !== "PARENT") return <PortalLoading />;
  return <PortalShell user={user} title="Message preferences" description="Choose the language your institute uses for fee reminder messages.">
    {error && <div className="mb-5"><PortalError message={error} /></div>}{notice && <p role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {loading ? <PortalLoading /> : <section className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(20,30,60,.035)] sm:p-7"><span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-[#6558d9]"><Languages className="h-5 w-5" /></span><h2 className="mt-4 text-lg font-semibold">Fee reminder language</h2><p className="mt-1 text-sm leading-6 text-slate-500">This preference applies to fee reminders sent by your institute. It does not change the language of this website.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">{([{ value: "EN", label: "English", sample: "Your fee instalment is due soon." }, { value: "HI", label: "Hindi", sample: "आपकी फीस की किस्त जल्द देय है।" }] as const).map((option) => <button key={option.value} type="button" onClick={() => setLanguage(option.value)} aria-pressed={language === option.value} className={`rounded-xl border p-4 text-left transition ${language === option.value ? "border-[#7569e8] bg-indigo-50/70 ring-2 ring-indigo-100" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"}`}><span className="flex items-center justify-between"><strong className="text-sm">{option.label}</strong>{language === option.value && <ShieldCheck className="h-4 w-4 text-[#6558d9]" />}</span><span className="mt-2 block text-sm text-slate-600">{option.sample}</span></button>)}</div>
      <button type="button" disabled={saving || loading} onClick={() => void save()} className="tracky-button-primary mt-5 min-h-11 disabled:opacity-50">{saving ? <><LoaderCircle className="h-4 w-4 animate-spin" />Saving…</> : <><Save className="h-4 w-4" />Save preference</>}</button>
    </section>}
  </PortalShell>;
}
