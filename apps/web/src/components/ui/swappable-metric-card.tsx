"use client";

/**
 * SwappableMetricCard — a MetricCard wrapped with the gear icon for
 * mode switching. Works on any page via the MetricsProvider.
 *
 * Drop-in replacement for MetricCard when you want the card to be
 * configurable (Intelligence / Dynamic / Custom modes).
 */

import { useOptionalMetrics, type CardMode } from "@/components/providers/metrics-context";
import { CardModePopover } from "./card-mode-popover";
import { MetricCard } from "./metric-card";
import type { LucideIcon } from "lucide-react";

interface SwappableMetricCardProps {
  /** Unique metric identifier for this card */
  slug: string;
  /** Page this card belongs to (e.g., "expenses", "revenue", "reports/runway") */
  pageId: string;
  /** All standard MetricCard props */
  label: string;
  value: string;
  change?: string;
  description?: string;
  icon?: LucideIcon;
  trend?: "up" | "down" | "flat";
  variant?: "default" | "success" | "danger" | "warning" | "brand";
  loading?: boolean;
  /** Whether AI features are enabled (for Intelligence mode availability) */
  aiEnabled?: boolean;
}

export function SwappableMetricCard({
  slug,
  pageId,
  aiEnabled = false,
  label,
  value,
  change,
  description,
  icon,
  trend,
  variant,
  loading,
}: SwappableMetricCardProps) {
  const metrics = useOptionalMetrics();

  // If no provider, render a plain MetricCard
  if (!metrics) {
    return (
      <MetricCard
        label={label}
        value={value}
        change={change}
        description={description}
        icon={icon}
        trend={trend}
        variant={variant}
        loading={loading}
      />
    );
  }

  const currentMode = metrics.getCardMode(pageId, slug);
  const isOverride = metrics.hasOverride(pageId, slug);

  const handleModeChange = (mode: CardMode | null) => {
    metrics.setCardMode(pageId, slug, mode);
  };

  if (loading) {
    return <MetricCard label={label} value="" loading />;
  }

  return (
    <div className="relative group">
      <MetricCard
        label={label}
        value={value}
        change={change}
        description={description}
        icon={icon}
        trend={trend}
        variant={variant}
        loading={loading}
      />
      {/* Gear icon — appears on hover */}
      <div className="absolute top-3 right-3">
        <CardModePopover
          currentMode={currentMode}
          onModeChange={handleModeChange}
          isOverride={isOverride}
          aiEnabled={aiEnabled}
          align="right"
        />
      </div>
    </div>
  );
}
