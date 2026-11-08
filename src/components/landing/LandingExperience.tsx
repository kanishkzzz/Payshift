"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import Navbar from "@/components/landing/Navbar";
import RefundCalculatorModal from "@/components/landing/RefundCalculatorModal";
import AgingDuesCheckerModal from "@/components/landing/AgingDuesCheckerModal";
import LiveDemoModal from "@/components/landing/LiveDemoModal";

type LandingAction = "refund" | "aging" | "demo";
const LandingActionContext = createContext<(action: LandingAction) => void>(() => undefined);

export function LandingActionButton({
  action,
  children,
  className,
}: {
  action: LandingAction;
  children: ReactNode;
  className: string;
}) {
  const runAction = useContext(LandingActionContext);
  return <button type="button" className={className} onClick={() => runAction(action)}>{children}</button>;
}

export default function LandingExperience({ children }: { children: ReactNode }) {
  const [openTool, setOpenTool] = useState<LandingAction | null>(null);
  const close = () => setOpenTool(null);
  const open = (action: LandingAction) => setOpenTool(action);

  return (
    <LandingActionContext.Provider value={open}>
      <Navbar
        onOpenRefundTool={() => open("refund")}
        onOpenAgingTool={() => open("aging")}
        onOpenLiveDemo={() => open("demo")}
      />
      <RefundCalculatorModal isOpen={openTool === "refund"} onClose={close} />
      <AgingDuesCheckerModal isOpen={openTool === "aging"} onClose={close} />
      <LiveDemoModal isOpen={openTool === "demo"} onClose={close} />
      {children}
    </LandingActionContext.Provider>
  );
}
