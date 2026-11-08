"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Building2,
  ChevronDown,
  CircleHelp,
  CreditCard,
  FileCheck2,
  FileSpreadsheet,
  Menu,
  MessageSquareText,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  UserRound,
  UserRoundCheck,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import TrackyBrandIcon from "@/components/TrackyBrandIcon";

type MenuName = "product" | "audience" | "tools" | "resources" | "login";

interface NavbarProps {
  onOpenRefundTool: () => void;
  onOpenAgingTool: () => void;
  onOpenLiveDemo: () => void;
}

const productItems = [
  { title: "Fee ledger", description: "Instalments, allocations, and balances", icon: BookOpen, href: "#product-ledger" },
  { title: "Parent payments", description: "OTP access, dues, and receipts", icon: Smartphone, href: "#product-parent" },
  { title: "Payment matching", description: "Review transfers without a student reference", icon: CreditCard, href: "#product-matching" },
  { title: "Refund cases", description: "Policy calculations and case tracking", icon: RefreshCw, href: "#product-refunds" },
  { title: "Fee reminders", description: "Scheduled messages in English or Hindi", icon: MessageSquareText, href: "#product-reminders" },
  { title: "Dues reporting", description: "Ageing by centre, batch, and student", icon: BarChart3, href: "#product-dues" },
  { title: "Counsellor tasks", description: "Review signals and coordinate outreach", icon: UserRoundCheck, href: "#product-risk" },
  { title: "Tally export", description: "Download receipt data for accounting", icon: FileSpreadsheet, href: "#product-tally" },
];

const audienceItems = [
  { title: "Institute owners", description: "See outstanding fees across centres", icon: Building2, href: "#product-ledger" },
  { title: "Accounts teams", description: "Work dues, matching, refunds, and exports", icon: WalletCards, href: "#product-matching" },
  { title: "Counsellors", description: "Review risk indicators and follow-up tasks", icon: UserRoundCheck, href: "#product-risk" },
  { title: "Parents", description: "Check instalments and payment receipts", icon: UserRound, href: "#product-parent" },
];

function MenuButton({
  name,
  label,
  active,
  onClick,
}: {
  name: MenuName;
  label: string;
  active: string | null;
  onClick: (name: MenuName) => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={active === name}
      aria-controls={`nav-menu-${name}`}
      onClick={() => onClick(name)}
      className="tracky-nav-link"
    >
      {label}
      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${active === name ? "rotate-180" : ""}`} />
    </button>
  );
}

function LinkGrid({ items, onNavigate }: { items: typeof productItems; onNavigate: () => void }) {
  const pathname = usePathname();
  return (
    <div className="grid gap-1 sm:grid-cols-2">
      {items.map(({ title, description, icon: Icon, href }) => (
        <Link key={title} href={pathname === "/" ? href : `/${href}`} onClick={onNavigate} className="tracky-menu-card">
          <span className="tracky-menu-icon"><Icon className="h-[17px] w-[17px]" /></span>
          <span>
            <span className="block text-sm font-semibold text-slate-900">{title}</span>
            <span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

export default function Navbar({ onOpenRefundTool, onOpenAgingTool, onOpenLiveDemo }: NavbarProps) {
  const pathname = usePathname();
  const [activeMenu, setActiveMenu] = useState<MenuName | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  const closeMenus = () => {
    setActiveMenu(null);
    setMobileOpen(false);
  };
  const toggleMenu = (name: MenuName) => setActiveMenu((current) => (current === name ? null : name));
  const landingAnchor = (href: string) => pathname === "/" ? href : `/${href}`;

  useEffect(() => {
    if (!activeMenu && !mobileOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !headerRef.current?.contains(event.target)) {
        setActiveMenu(null);
        setMobileOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveMenu(null);
        setMobileOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [activeMenu, mobileOpen]);

  return (
    <header ref={headerRef} className="sticky top-0 z-50 w-full border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
      <nav aria-label="Main navigation" className="relative mx-auto flex h-[68px] w-full min-w-0 max-w-[1280px] items-center justify-between px-4 sm:px-8">
        <Link href="/" aria-label="Tracky home" className="flex shrink-0 items-center gap-2.5" onClick={closeMenus}>
          <TrackyBrandIcon className="h-8 w-8 rounded-[9px] shadow-[0_4px_10px_rgba(84,112,255,.22)]" />
          <span className="text-[19px] font-bold tracking-[-.045em] text-slate-950">tracky</span>
        </Link>

        <div className="hidden items-center gap-1 lg:flex">
          <div className="relative">
            <MenuButton name="product" label="Product" active={activeMenu} onClick={toggleMenu} />
            {activeMenu === "product" && (
              <div id="nav-menu-product" className="tracky-mega-menu left-1/2 w-[700px] -translate-x-1/2">
                <div className="mb-4 flex items-end justify-between border-b border-slate-100 pb-3">
                  <div><p className="text-[11px] font-semibold uppercase tracking-[.13em] text-[#5470ff]">The platform</p><h2 className="mt-1 text-lg font-semibold text-slate-950">A connected fee workflow</h2></div>
                  <Link href="/product" onClick={closeMenus} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-[#5470ff]">Product guide <ArrowRight className="h-3.5 w-3.5" /></Link>
                </div>
                <LinkGrid items={productItems} onNavigate={closeMenus} />
              </div>
            )}
          </div>

          <div className="relative">
            <MenuButton name="audience" label="Who it’s for" active={activeMenu} onClick={toggleMenu} />
            {activeMenu === "audience" && <div id="nav-menu-audience" className="tracky-mega-menu left-0 w-[500px]"><LinkGrid items={audienceItems} onNavigate={closeMenus} /></div>}
          </div>

          <div className="relative">
            <MenuButton name="tools" label="Tools" active={activeMenu} onClick={toggleMenu} />
            {activeMenu === "tools" && (
              <div id="nav-menu-tools" className="tracky-mega-menu left-0 w-[330px]">
                <button onClick={() => { closeMenus(); onOpenRefundTool(); }} className="tracky-tool-link"><span className="tracky-menu-icon"><RefreshCw className="h-4 w-4" /></span><span className="flex-1 text-left"><span className="block text-sm font-semibold text-slate-900">Refund calculator</span><span className="mt-1 block text-xs text-slate-500">Preview a policy-based fee breakdown</span></span><ArrowRight className="h-4 w-4 text-slate-400" /></button>
                <button onClick={() => { closeMenus(); onOpenAgingTool(); }} className="tracky-tool-link"><span className="tracky-menu-icon"><BarChart3 className="h-4 w-4" /></span><span className="flex-1 text-left"><span className="block text-sm font-semibold text-slate-900">Ageing dues checker</span><span className="mt-1 block text-xs text-slate-500">Explore the app’s overdue buckets</span></span><ArrowRight className="h-4 w-4 text-slate-400" /></button>
              </div>
            )}
          </div>

          <Link href="/for-parents" onClick={closeMenus} className="tracky-nav-link">For parents</Link>

          <div className="relative">
            <MenuButton name="resources" label="Resources" active={activeMenu} onClick={toggleMenu} />
            {activeMenu === "resources" && (
              <div id="nav-menu-resources" className="tracky-mega-menu right-0 w-[300px]">
                <Link href={landingAnchor("#workflow")} onClick={closeMenus} className="tracky-resource-link"><BookOpen className="h-4 w-4 text-[#5470ff]" />How it works</Link>
                <Link href={landingAnchor("#security")} onClick={closeMenus} className="tracky-resource-link"><ShieldCheck className="h-4 w-4 text-[#5470ff]" />Privacy and access</Link>
                <Link href={landingAnchor("#faq")} onClick={closeMenus} className="tracky-resource-link"><CircleHelp className="h-4 w-4 text-[#5470ff]" />Frequently asked questions</Link>
                <a href="https://github.com/kanishkzzz/Payshift" target="_blank" rel="noopener noreferrer" onClick={closeMenus} className="tracky-resource-link"><FileCheck2 className="h-4 w-4 text-[#5470ff]" />Source on GitHub</a>
              </div>
            )}
          </div>
        </div>

        <div className="hidden items-center gap-2 lg:flex">
          <div className="relative">
            <MenuButton name="login" label="Log in" active={activeMenu} onClick={toggleMenu} />
            {activeMenu === "login" && <div id="nav-menu-login" className="tracky-mega-menu right-0 w-[230px]"><Link href="/login?tab=parent" onClick={closeMenus} className="tracky-login-choice"><Smartphone className="h-4 w-4 text-[#5470ff]" /><span><strong>Parent login</strong><small>Phone OTP</small></span></Link><Link href="/login?tab=staff" onClick={closeMenus} className="tracky-login-choice"><UsersRound className="h-4 w-4 text-[#8f45f2]" /><span><strong>Staff login</strong><small>Email and password</small></span></Link></div>}
          </div>
          <button onClick={onOpenLiveDemo} className="tracky-nav-cta">Try live demo <ArrowRight className="h-3.5 w-3.5" /></button>
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700">Log in</Link>
          <button type="button" aria-label={mobileOpen ? "Close menu" : "Open menu"} aria-expanded={mobileOpen} onClick={() => setMobileOpen((open) => !open)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-800">
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {mobileOpen && (
        <div className="absolute inset-x-0 top-[68px] max-h-[calc(100dvh-68px)] overflow-y-auto border-b border-slate-200 bg-white px-5 pb-6 pt-2 shadow-xl lg:hidden">
          <details className="tracky-mobile-group"><summary>Product <ChevronDown className="h-4 w-4" /></summary><div className="grid grid-cols-1 gap-1 pb-2 sm:grid-cols-2">{productItems.map((item) => <Link key={item.title} onClick={closeMenus} href={landingAnchor(item.href)} className="rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">{item.title}</Link>)}</div></details>
          <details className="tracky-mobile-group"><summary>Who it’s for <ChevronDown className="h-4 w-4" /></summary><div className="grid grid-cols-1 gap-1 pb-2 sm:grid-cols-2">{audienceItems.map((item) => <Link key={item.title} onClick={closeMenus} href={landingAnchor(item.href)} className="rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">{item.title}</Link>)}</div></details>
          <details className="tracky-mobile-group"><summary>Tools <ChevronDown className="h-4 w-4" /></summary><div className="grid gap-2 pb-2 sm:grid-cols-2"><button onClick={() => { closeMenus(); onOpenRefundTool(); }} className="rounded-lg bg-slate-50 px-3 py-3 text-left text-sm font-medium">Refund calculator</button><button onClick={() => { closeMenus(); onOpenAgingTool(); }} className="rounded-lg bg-slate-50 px-3 py-3 text-left text-sm font-medium">Ageing dues checker</button></div></details>
          <Link href="/for-parents" onClick={closeMenus} className="block border-b border-slate-100 py-3 text-sm font-medium text-slate-700">For parents</Link>
          <details className="tracky-mobile-group"><summary>Resources <ChevronDown className="h-4 w-4" /></summary><div className="grid gap-1 pb-2">{[{label:"How it works",href:"#workflow"},{label:"Privacy and access",href:"#security"},{label:"FAQ",href:"#faq"}].map((item)=><Link key={item.label} href={landingAnchor(item.href)} onClick={closeMenus} className="rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">{item.label}</Link>)}</div></details>
          <button onClick={() => { closeMenus(); onOpenLiveDemo(); }} className="tracky-nav-cta mt-4 w-full justify-center py-3">Try live demo <ArrowRight className="h-4 w-4" /></button>
        </div>
      )}
    </header>
  );
}
