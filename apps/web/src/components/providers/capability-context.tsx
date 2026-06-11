"use client";

import { createContext, useContext } from "react";
import type { Capabilities } from "@/lib/capabilities";

const CapabilityContext = createContext<Capabilities | null>(null);

export function CapabilityProvider({
  value,
  children,
}: {
  value: Capabilities;
  children: React.ReactNode;
}) {
  return <CapabilityContext.Provider value={value}>{children}</CapabilityContext.Provider>;
}

export function useCapabilities(): Capabilities {
  const ctx = useContext(CapabilityContext);
  if (!ctx) throw new Error("useCapabilities must be used within CapabilityProvider");
  return ctx;
}
