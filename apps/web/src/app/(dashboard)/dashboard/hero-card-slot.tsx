"use client";

/**
 * HeroCardSlot — renders a single hero card with mode-aware swap logic.
 * In Dynamic mode: shows the swap card if the original has no data.
 * In Custom/Intelligence mode: shows the original card (ghost state if no data).
 */

import { useDashboardIntelligence } from "./dashboard-intelligence-context";
import { HeroKpiCard, type HeroKpiCardProps, type KpiVariant } from "./hero-kpi-card";

export interface HeroCardSlotProps {
  index: number;
  variant: KpiVariant;
  hasData: boolean;
  allPopulated: boolean;
  cardProps: Omit<HeroKpiCardProps, "variant">;
  /** Swap data for Dynamic mode (when original has no data) */
  swapProps?: {
    originalSlug: string;
    originalLabel: string;
    restoreHint: string;
    variant: KpiVariant;
    cardProps: Omit<HeroKpiCardProps, "variant">;
  } | null;
}

export function HeroCardSlot({
  index,
  variant,
  hasData,
  allPopulated,
  cardProps,
  swapProps,
}: HeroCardSlotProps) {
  const { mode } = useDashboardIntelligence();

  // Dynamic mode: swap empty cards with alternatives
  if (mode === "dynamic" && !hasData && swapProps) {
    return (
      <HeroKpiCard
        variant={swapProps.variant}
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

  // Dynamic mode: hide card if no data and no swap available
  if (mode === "dynamic" && !hasData && !swapProps) {
    return null;
  }

  // Default: render the original card (ghost state if no data in Custom mode)
  return (
    <HeroKpiCard
      variant={variant}
      {...cardProps}
      stagger={index}
      heroCardIndex={index}
      celebrate={allPopulated}
    />
  );
}
