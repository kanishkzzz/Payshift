"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, BarChart3, BriefcaseBusiness, CreditCard, FileClock, Languages, LogOut, Receipt, UsersRound } from "lucide-react";
import TrackyBrandIcon from "@/components/TrackyBrandIcon";

export interface PortalUser {
  id: string;
  name: string;
  email?: string | null;
  phone?: string;
  role?: "ADMIN" | "ACCOUNTS" | "COUNSELLOR";
  subjectType: "PARENT" | "STAFF";
}

export function usePortalSession() {
  const router = useRouter();
  const [user, setUser] = useState<PortalUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.user) throw new Error("Your session has expired.");
        if (active) setUser(payload.user as PortalUser);
      })
      .catch(() => {
        if (active) router.replace("/login");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [router]);

  return { user, loading };
}

export function useStaffAccess(roles: Array<NonNullable<PortalUser["role"]>>) {
  const router = useRouter();
  const { user, loading } = usePortalSession();
  const allowed = user?.subjectType === "STAFF" && !!user.role && roles.includes(user.role);
  const roleKey = roles.join("|");

  useEffect(() => {
    if (loading || !user) return;
    const allowedRoles = roleKey.split("|");
    if (user.subjectType === "PARENT") router.replace("/parent/dues");
    else if (!allowedRoles.includes(user.role ?? "ACCOUNTS")) router.replace(user.role === "COUNSELLOR" ? "/counsellor" : "/dashboard");
  }, [loading, user, router, roleKey]);

  const authorizedUser = user?.subjectType === "STAFF" && user.role && roles.includes(user.role) ? user : null;
  return { user: authorizedUser, loading, allowed };
}

export function PortalShell({
  user,
  title,
  description,
  children,
}: {
  user: PortalUser;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const isAccounts = user.subjectType === "STAFF" && (user.role === "ACCOUNTS" || user.role === "ADMIN");
  const isCounsellor = user.subjectType === "STAFF" && (user.role === "COUNSELLOR" || user.role === "ADMIN");
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/");
      router.refresh();
    }
  };

  return (
    <div className="tracky-workspace min-h-screen text-slate-900">
      <header className="sticky top-0 z-30 border-b border-white/70 bg-white/90 shadow-[0_1px_0_rgba(15,23,42,.03)] backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2" aria-label="Tracky home">
            <TrackyBrandIcon className="h-8 w-8 rounded-xl shadow-[0_5px_12px_rgba(84,112,255,.22)]" />
            <span className="font-bold tracking-tight">tracky</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="hidden text-right sm:block"><span className="block text-xs font-semibold">{user.name}</span><span className="text-[10px] text-slate-500">{user.role ?? "Parent"}</span></span>
            <button type="button" onClick={signOut} disabled={signingOut} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"><LogOut className="h-4 w-4" /><span>{signingOut ? "Signing outâ€¦" : "Sign out"}</span></button>
          </div>
        </div>
        <nav aria-label="Workspace" className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2 sm:px-6">
          {user.subjectType === "PARENT" ? <><NavItem href="/parent/dues" icon={<Receipt className="h-3.5 w-3.5" />}>Fee overview</NavItem><NavItem href="/parent/preferences" icon={<Languages className="h-3.5 w-3.5" />}>Message preferences</NavItem></> : <>
            {isAccounts && <><NavItem href="/dashboard" icon={<BarChart3 className="h-3.5 w-3.5" />}>Overview</NavItem><NavItem href="/dashboard/unmatched" icon={<CreditCard className="h-3.5 w-3.5" />}>Unmatched</NavItem><NavItem href="/dashboard/refunds" icon={<FileClock className="h-3.5 w-3.5" />}>Refunds</NavItem><NavItem href="/dashboard/tally" icon={<BriefcaseBusiness className="h-3.5 w-3.5" />}>Exports</NavItem></>}
            {isCounsellor && <NavItem href="/counsellor" icon={<UsersRound className="h-3.5 w-3.5" />}>Counsellor workspace</NavItem>}
          </>}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Tracky home</Link>
        <div className="mt-8 rounded-3xl border border-white/80 bg-white/75 p-5 shadow-[0_12px_38px_rgba(26,36,76,.045)] sm:p-7"><p className="text-[11px] font-semibold uppercase tracking-[.15em] text-[#6558d9]">{user.role ?? "Parent account"}</p><h1 className="mt-2 text-3xl font-bold tracking-[-.045em] sm:text-4xl">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{description}</p></div>
        <div className="mt-8">{children}</div>
      </main>
    </div>
  );
}

function NavItem({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href;
  return <Link href={href} aria-current={active ? "page" : undefined} className={`inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition ${active ? "bg-indigo-50 text-[#5d52d5]" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"}`}>{icon}{children}</Link>;
}

export function PortalLoading() {
  return <main className="tracky-workspace grid min-h-screen place-items-center text-sm text-slate-500">Loading your Tracky workspaceâ€¦</main>;
}

export function PortalError({ message }: { message: string }) {
  return <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{message}</div>;
}

