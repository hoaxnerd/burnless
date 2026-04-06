"use client";

import type { LucideIcon } from "lucide-react";
import { SwappableMetricCard } from "./swappable-metric-card";

export interface MetricCardConfig {
  slug: string;
  label: string;
  value: string;
  change?: string;
  description?: string;
  icon?: LucideIcon;
  trend?: "up" | "down" | "flat";
  variant?: "default" | "success" | "danger" | "warning" | "brand";
  loading?: boolean;
}

interface MetricCardsGridProps {
  cards: MetricCardConfig[];
  /** Gap between cards — default 4 (gap-4). Use 6 for gap-6 pages. */
  gap?: 4 | 6;
}

export function MetricCardsGrid({ cards, gap = 4 }: MetricCardsGridProps) {
  // Static class lookup — dynamic template literals are purged by Tailwind
  const gapClass = gap === 6 ? "gap-6" : "gap-4";

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 ${gapClass} animate-fade-in`}>
      {cards.map((card, i) => (
        <div key={card.slug} className={`stagger-${i + 1} animate-slide-up`}>
          <SwappableMetricCard
            slug={card.slug}
            label={card.label}
            value={card.value}
            change={card.change}
            description={card.description}
            loading={card.loading}
            stagger={i}
          />
        </div>
      ))}
    </div>
  );
}
