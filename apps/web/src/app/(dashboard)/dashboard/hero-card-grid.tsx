"use client";

/**
 * HeroCardGrid — mode-aware hero KPI card grid.
 *
 * In Dynamic mode: auto-hides empty cards and swaps in available alternatives.
 * In Custom mode: keeps user-pinned cards visible even if empty (ghost state).
 * In Intelligence mode: shows original cards (AI manages separately).
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

  // In Dynamic mode, filter out empty cards with no available swap
  // In Custom/Intelligence mode, keep all cards (ghost state for user-pinned)
  const visibleEntries = cards
    .map((card, index) => ({ card, index }))
    .filter(({ card, index }) => {
      if (mode === "dynamic" && !card.hasData && !swapBySlot.has(index)) {
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
        // In Dynamic mode, swap empty cards with alternatives
        if (mode === "dynamic" && !card.hasData && swapBySlot.has(index)) {
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

        // Default: render the original card (ghost state if no data in Custom mode)
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
