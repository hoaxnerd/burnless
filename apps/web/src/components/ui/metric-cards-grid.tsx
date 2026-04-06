"use client";

import { SwappableMetricCard } from "./swappable-metric-card";

export interface MetricCardConfig {
  slug: string;
  label: string;
  value: string;
  change?: string;
  changeLabel?: string;
  description?: string;
  sparkData?: number[];
  metricStyle?: { icon: string; color: string; href: string };
  hasData?: boolean;
  lowerIsBetter?: boolean;
  loading?: boolean;
}

interface MetricCardsGridProps {
  cards: MetricCardConfig[];
  /** Gap between cards — default 4 (gap-4). Use 6 for gap-6 pages. */
  gap?: 4 | 6;
}

export function MetricCardsGrid({ cards, gap = 4 }: MetricCardsGridProps) {
  const gapClass = gap === 6 ? "gap-6" : "gap-4";
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 ${gapClass} animate-fade-in`}>
      {cards.map((card, i) => (
        <SwappableMetricCard
          key={card.slug}
          slug={card.slug}
          label={card.label}
          value={card.value}
          change={card.change}
          changeLabel={card.changeLabel}
          description={card.description}
          sparkData={card.sparkData}
          metricStyle={card.metricStyle}
          hasData={card.hasData}
          lowerIsBetter={card.lowerIsBetter}
          loading={card.loading}
          stagger={i}
        />
      ))}
    </div>
  );
}
