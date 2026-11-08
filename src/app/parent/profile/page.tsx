"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CircleUserRound, Languages, LoaderCircle, Save, ShieldCheck, UserRound } from "lucide-react";
import { PortalError, PortalLoading, PortalShell, usePortalSession } from "@/components/portal/PortalShell";

interface ChildProfile { id: string; name: string; batch: { name: string } }
interface Profile { id: string; name: string; email: string | null; phone: string; relation: string; avatarUrl: string | null }
type ReminderLanguage = "EN" | "HI";

export default function ParentProfilePage() {
  const router = useRouter();
  const { user, setUser, loading: sessionLoading } = usePortalSession();
  const fileInput = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [children, setChildren] = useState<ChildProfile[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reminderLanguage, setReminderLanguage] = useState<ReminderLanguage>("EN");
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [preferencesNotice, setPreferencesNotice] = useState("");
  const [preferencesError, setPreferencesError] = useState("");

  useEffect(() => {
    if (sessionLoading || !user) return;
    if (user.subjectType !== "PARENT") { router.replace(user.role === "COUNSELLOR" ? "/counsellor" : "/dashboard"); return; }
    let active = true;
    fetch("/api/parent/profile", { cache: "no-store" }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not load your profile.");
      if (active) { setProfile(payload.profile); setName(payload.profile.name); setChildren(payload.children); }
    }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load your profile."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sessionLoading, user, router]);

  useEffect(() => {
    if (sessionLoading || !user || user.subjectType !== "PARENT") return;
    let active = true;
    fetch("/api/parent/preferences", { cache: "no-store" }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not load message preferences.");
      if (active) setReminderLanguage(payload.preferredLang === "HI" ? "HI" : "EN");
    }).catch((cause: unknown) => {
      if (active) setPreferencesError(cause instanceof Error ? cause.message : "Could not load message preferences.");
    }).finally(() => { if (active) setPreferencesLoading(false); });
    return () => { active = false; };
  }, [sessionLoading, user]);

  async function saveReminderLanguage() {
    setPreferencesSaving(true); setPreferencesError(""); setPreferencesNotice("");
    try {
      const response = await fetch("/api/parent/preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preferredLang: reminderLanguage }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not save message preferences.");
      setReminderLanguage(payload.preferredLang === "HI" ? "HI" : "EN");
      setPreferencesNotice(`Fee reminders will be sent in ${payload.preferredLang === "HI" ? "Hindi" : "English"}.`);
    } catch (cause) {
      setPreferencesError(cause instanceof Error ? cause.message : "Could not save message preferences.");
    } finally { setPreferencesSaving(false); }
  }

  function applyProfile(next: Pick<Profile, "id"> & Partial<Profile>) {
    setProfile((current) => current ? { ...current, ...next } : current);
    if (next.name !== undefined) setName(next.name);
    setUser((current) => current ? {
      ...current,
      ...(next.name !== undefined ? { name: next.name } : {}),
      ...(next.avatarUrl !== undefined ? { avatarUrl: next.avatarUrl } : {}),
    } : current);
  }

  async function saveName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/parent/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? "Could not save your name.");
      applyProfile(payload.profile); setNotice("Your name has been updated.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save your name."); }
    finally { setSaving(false); }
  }

  async function uploadImage(file?: File) {
    if (!file) return;
    setUploading(true); setError(""); setNotice("");
    try {
      const form = new FormData(); form.set("image", file);
      const response = await fetch("/api/parent/profile/avatar", { method: "POST", body: form });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? "Could not upload your image.");
      applyProfile(payload.profile); setNotice("Your profile photo has been updated.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not upload your image."); }
    finally { setUploading(false); if (fileInput.current) fileInput.current.value = ""; }
  }

  if (sessionLoading || !user || user.subjectType !== "PARENT") return <PortalLoading />;
  return <PortalShell user={user} title="Your profile" description="Manage how your parent account appears and check which students are linked to it.">
    {error && <div className="mb-5"><PortalError message={error} /></div>}
    {notice && <p role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {loading ? <PortalLoading /> : profile && <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,.8fr)]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(20,30,60,.035)] sm:p-7">
        <div className="flex items-center gap-4 border-b border-slate-100 pb-6">
          <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full border border-slate-200 bg-indigo-50 text-indigo-600">{profile.avatarUrl ? <span aria-hidden="true" className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url("${profile.avatarUrl}")` }} /> : <CircleUserRound className="h-8 w-8" />}</div>
          <div className="min-w-0"><h2 className="font-semibold">Profile photo</h2><p className="mt-1 text-xs text-slate-500">JPG, PNG or WebP, up to 5 MB.</p>
            <div className="mt-3 flex flex-wrap gap-2"><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => void uploadImage(event.target.files?.[0])} /><button type="button" onClick={() => fileInput.current?.click()} disabled={uploading} className="tracky-button-secondary min-h-9 px-3 text-xs disabled:opacity-50">{uploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}{uploading ? "Uploading…" : "Change photo"}</button>
              {profile.avatarUrl && <button type="button" disabled={uploading} onClick={async () => { setUploading(true); setError(""); try { const response = await fetch("/api/parent/profile/avatar", { method: "DELETE" }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? "Could not remove the photo."); applyProfile(payload.profile); setNotice("Your profile photo has been removed."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not remove the photo."); } finally { setUploading(false); } }} className="min-h-9 rounded-lg px-3 text-xs font-semibold text-slate-500 hover:bg-slate-50">Remove</button>}</div>
          </div>
        </div>
        <form onSubmit={(event) => void saveName(event)} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-slate-700">Full name<input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={100} className="tracky-input mt-2 w-full" autoComplete="name" /></label>
          <div className="grid gap-4 sm:grid-cols-2"><div><span className="text-xs font-medium text-slate-500">Mobile number</span><p className="mt-1 text-sm font-medium">{profile.phone}</p></div><div><span className="text-xs font-medium text-slate-500">Relationship</span><p className="mt-1 text-sm font-medium">{(profile.relation || "Parent").toLowerCase()}</p></div></div>
          {profile.email && <div><span className="text-xs font-medium text-slate-500">Email</span><p className="mt-1 text-sm font-medium">{profile.email}</p></div>}
          <button type="submit" disabled={saving || name.trim() === profile.name} className="tracky-button-primary min-h-10 disabled:opacity-50">{saving ? <><LoaderCircle className="h-4 w-4 animate-spin" />Saving…</> : <><Save className="h-4 w-4" />Save name</>}</button>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(20,30,60,.035)] sm:p-7">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-[#6558d9]"><UserRound className="h-5 w-5" /></span><h2 className="mt-4 text-lg font-semibold">Linked students</h2><p className="mt-1 text-sm leading-6 text-slate-500">These student records are associated with your parent account.</p>
        {children.length ? <ul className="mt-5 divide-y divide-slate-100">{children.map((child) => <li key={child.id} className="py-4 first:pt-0 last:pb-0"><p className="font-semibold">{child.name}</p><p className="mt-1 text-xs text-slate-500">Student ID <span className="font-mono text-slate-700">{child.id}</span></p><p className="mt-1 text-xs text-slate-500">{child.batch.name}</p></li>)}</ul> : <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">No students are linked to this account yet. Contact your institute to link a student.</div>}
        <p className="mt-5 flex gap-2 rounded-xl bg-emerald-50 p-3 text-xs leading-5 text-emerald-800"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />Student names and IDs are managed by your institute. Contact them if a record needs correction.</p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(20,30,60,.035)] sm:p-7 lg:col-span-2">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-[#6558d9]"><Languages className="h-5 w-5" /></span>
        <h2 className="mt-4 text-lg font-semibold">Message preferences</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Choose the language your institute uses for fee reminder messages. This does not change the language of the website.</p>
        {preferencesError && <div className="mt-4"><PortalError message={preferencesError} /></div>}
        {preferencesNotice && <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{preferencesNotice}</p>}
        {preferencesLoading ? <div className="mt-5"><PortalLoading /></div> : <>
          <div className="mt-5 grid max-w-2xl gap-3 sm:grid-cols-2">{([{ value: "EN", label: "English", sample: "Your fee instalment is due soon." }, { value: "HI", label: "Hindi", sample: "आपकी फीस की किस्त जल्द देय है।" }] as const).map((option) => <button key={option.value} type="button" onClick={() => { setReminderLanguage(option.value); setPreferencesNotice(""); }} aria-pressed={reminderLanguage === option.value} className={`rounded-xl border p-4 text-left transition ${reminderLanguage === option.value ? "border-[#7569e8] bg-indigo-50/70 ring-2 ring-indigo-100" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"}`}><span className="flex items-center justify-between"><strong className="text-sm">{option.label}</strong>{reminderLanguage === option.value && <ShieldCheck className="h-4 w-4 text-[#6558d9]" />}</span><span className="mt-2 block text-sm text-slate-600">{option.sample}</span></button>)}</div>
          <button type="button" disabled={preferencesSaving || preferencesLoading} onClick={() => void saveReminderLanguage()} className="tracky-button-primary mt-5 min-h-11 disabled:opacity-50">{preferencesSaving ? <><LoaderCircle className="h-4 w-4 animate-spin" />Saving…</> : <><Save className="h-4 w-4" />Save preference</>}</button>
        </>}
      </section>
    </div>}
  </PortalShell>;
}
