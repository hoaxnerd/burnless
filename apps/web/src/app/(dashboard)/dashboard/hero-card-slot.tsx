"use client";

/**
 * HeroCardSlot — renders a single hero card with mode-aware swap logic.
 * In Dynamic mode: shows the swap card if the original has no data.
 * In Custom/Intelligence mode: shows the original card (ghost state if no data).
 */

import { useEffect } from "react";
import { useMetrics } from "@/components/providers/metrics-context";
import { usePageLayoutContext } from "@/components/providers/page-layout-context";
import { HeroKpiCard, type HeroKpiCardProps } from "./hero-kpi-card";

export interface HeroCardSlotProps {
  index: number;
  hasData: boolean;
  allPopulated: boolean;
  cardProps: HeroKpiCardProps;
  swapProps?: {
    originalSlug: string;
    originalLabel: string;
    restoreHint: string;
    cardProps: HeroKpiCardProps;
  } | null;
}

export function HeroCardSlot({
  index,
  hasData,
  allPopulated,
  cardProps,
  swapProps,
}: HeroCardSlotProps) {
  const { mode } = useMetrics();
  const { reportWidgetReady, reportWidgetNotReady } = usePageLayoutContext();

  // Report readiness based on data availability
  const isReady = !(mode === "dynamic" && !hasData && !swapProps);
  useEffect(() => {
    const widgetId = `hero-${index}`;
    if (isReady) {
      reportWidgetReady(widgetId);
    } else {
      reportWidgetNotReady(widgetId);
    }
  }, [isReady, index, reportWidgetReady, reportWidgetNotReady]);

  // Dynamic mode: swap empty cards with alternatives
  if (mode === "dynamic" && !hasData && swapProps) {
    return (
      <HeroKpiCard
        {...swapProps.cardProps}
        stagger={index}
        heroCardIndex={index}
        celebrate={false}
        swapInfo={{
          replacedSlug: swapProps.originalSlug,
          replacedLabel: swapProps.originalLabel,
          restoreHint: swapProps.restoreHint,
        }}
      />
    );
  }

  // Not ready (no data, no swap) — return null, grid shows "Not Available"
  if (!isReady) return null;

  // Default: render the original card (ghost state if no data in Custom mode)
  return (
    <HeroKpiCard
      {...cardProps}
      stagger={index}
      heroCardIndex={index}
      celebrate={allPopulated}
    />
  );
}
