"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { ResolvedSlotData } from "@burnless/engine";

interface ComputedMetricsState {
  /** All resolved slot data for this page */
  slots: ResolvedSlotData[];
  /** Look up resolved data by slot ID */
  getSlot: (slotId: string) => ResolvedSlotData | undefined;
  /** Look up resolved data by metric slug (first match) */
  getBySlug: (slug: string) => ResolvedSlotData | undefined;
}

const ComputedMetricsCtx = createContext<ComputedMetricsState | null>(null);

export function ComputedMetricsProvider({
  slotData,
  children,
}: {
  slotData: ResolvedSlotData[];
  children: ReactNode;
}) {
  const value = useMemo<ComputedMetricsState>(() => {
    const byId = new Map(slotData.map((s) => [s.slotId, s]));
    const bySlug = new Map(
      slotData
        .filter((s) => s.content.type === "metric")
        .map((s) => [(s.content as { type: "metric"; slug: string }).slug, s])
    );
    return {
      slots: slotData,
      getSlot: (id) => byId.get(id),
      getBySlug: (slug) => bySlug.get(slug),
    };
  }, [slotData]);

  return (
    <ComputedMetricsCtx.Provider value={value}>
      {children}
    </ComputedMetricsCtx.Provider>
  );
}

/** Returns computed metrics context. Throws if outside a provider. */
export function useComputedMetrics(): ComputedMetricsState {
  const ctx = useContext(ComputedMetricsCtx);
  if (!ctx) throw new Error("useComputedMetrics must be used within ComputedMetricsProvider");
  return ctx;
}

/** Returns computed metrics context, or null if outside a provider. */
export function useOptionalComputedMetrics(): ComputedMetricsState | null {
  return useContext(ComputedMetricsCtx);
}
