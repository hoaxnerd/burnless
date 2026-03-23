"use client";

/**
 * HeroCardGrid — mode-aware hero KPI card grid.
 *
 * In ALL modes: empty cards are swapped with available alternatives when possible.
 * Ghost state only appears when no metric in the entire system has data.
 * In Dynamic/Intelligence modes: empty cards with no swap are hidden.
 * In Custom mode: empty cards with no swap remain visible with an actionable prompt.
 */

import { useDashboardIntelligence } from "./dashboard-intelligence-context";
import { HeroKpiCard, type KpiVariant, type HeroKpiCardProps } from "./hero-kpi-card";

export interface HeroCardDatum {
  /** Variant key for the 4 defaults */
  variant: KpiVariant;
  /** Card props as rendered in the default (non-swapped) state */
  props: Omit<HeroKpiCardProps, "variant">;
  /** Whether this card has actual data */
  hasData: boolean;
}

export interface SwapCardDatum {
  /** The original slot index being replaced */
  slotIndex: number;
  /** The original card's label (for the swap tooltip) */
  originalLabel: string;
  /** The original card's slug */
  originalSlug: string;
  /** Hint for restoring the original metric */
  restoreHint: string;
  /** Variant fallback (use the same position variant for grid consistency) */
  variant: KpiVariant;
  /** Card props for the replacement metric */
  props: Omit<HeroKpiCardProps, "variant">;
}

interface HeroCardGridProps {
  /** The 4 default hero cards in order */
  cards: HeroCardDatum[];
  /** Pre-computed replacement cards for empty slots (Dynamic mode) */
  swaps: SwapCardDatum[];
  /** Whether all primary data sources are populated */
  allPopulated: boolean;
}

export function HeroCardGrid({ cards, swaps, allPopulated }: HeroCardGridProps) {
  const { mode } = useDashboardIntelligence();

  // Build a map of slot index → swap datum for quick lookup
  const swapBySlot = new Map<number, SwapCardDatum>();
  for (const swap of swaps) {
    swapBySlot.set(swap.slotIndex, swap);
  }

  // Hide empty cards with no available swap in Dynamic & Intelligence modes.
  // In Custom mode, keep empty cards visible (user's explicit choice).
  const visibleEntries = cards
    .map((card, index) => ({ card, index }))
    .filter(({ card, index }) => {
      if ((mode === "dynamic" || mode === "intelligence") && !card.hasData && !swapBySlot.has(index)) {
        return false;
      }
      return true;
    });

  // Adapt grid columns to number of visible cards
  const gridCols =
    visibleEntries.length <= 2
      ? "grid-cols-2"
      : visibleEntries.length === 3
        ? "grid-cols-2 lg:grid-cols-3"
        : "grid-cols-2 lg:grid-cols-4";

  if (visibleEntries.length === 0) return null;

  return (
    <div className={`grid ${gridCols} gap-4 sm:gap-6 mb-8 sm:mb-12`}>
      {visibleEntries.map(({ card, index }) => {
        // In ANY mode, swap empty cards with available alternatives
        if (!card.hasData && swapBySlot.has(index)) {
          const swap = swapBySlot.get(index)!;
          return (
            <HeroKpiCard
              key={`swap-${swap.props.slug}`}
              variant={swap.variant}
              {...swap.props}
              stagger={index}
              heroCardIndex={index}
              celebrate={false}
              swapInfo={{
                replacedSlug: swap.originalSlug,
                replacedLabel: swap.originalLabel,
                restoreHint: swap.restoreHint,
              }}
            />
          );
        }

        // Default: render the original card
        return (
          <HeroKpiCard
            key={card.variant}
            variant={card.variant}
            {...card.props}
            stagger={index}
            heroCardIndex={index}
            celebrate={allPopulated}
          />
        );
      })}
    </div>
  );
}
