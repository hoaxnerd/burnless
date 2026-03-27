"use client";

/**
 * SwappableMetricCard — a MetricCard wrapped with WidgetCard for
 * consistent card chrome and mode switching across all pages.
 *
 * Drop-in replacement for MetricCard when you want the card to be
 * configurable (Intelligence / Dynamic / Custom modes).
 */

import { useOptionalMetrics } from "@/components/providers/metrics-context";
import { WidgetCard } from "./widget-card";
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

  if (loading) {
    return <MetricCard label={label} value="" loading />;
  }

  return (
    <WidgetCard slug={slug} pageId={pageId} bare>
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
    </WidgetCard>
  );
}
