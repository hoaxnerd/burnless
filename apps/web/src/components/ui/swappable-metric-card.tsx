"use client";

/**
 * SwappableMetricCard — a MetricCard wrapped with WidgetCard for
 * consistent card chrome and mode switching across all pages.
 *
 * Drop-in replacement for MetricCard when you want the card to be
 * configurable (Intelligence / Dynamic / Custom modes).
 */

import { useOptionalMetrics } from "@/components/providers/metrics-context";
import { useOptionalComputedMetrics } from "@/components/providers/computed-metrics-context";
import { usePageId } from "@/components/providers/page-context";
import { WidgetCard } from "./widget-card";
import { MetricCard } from "./metric-card";
import type { LucideIcon } from "lucide-react";
import type { CardContent } from "@burnless/engine";

interface SwappableMetricCardProps {
  /** Unique metric identifier for this card */
  slug: string;
  /** Page this card belongs to (e.g., "expenses", "revenue", "reports/runway") */
  pageId?: string;
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
  const computed = useOptionalComputedMetrics();
  const contextPageId = usePageId();
  const resolvedPageId = pageId || contextPageId || "";

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

  // Check for slot override — if user swapped this card to a different metric.
  // The original slug stays as the card slot identity for WidgetCard (modes + overrides
  // are always keyed to the original slug so they persist across swaps).
  const override: CardContent | null = metrics?.getSlotOverride(resolvedPageId, slug) ?? null;

  // If overridden to a different metric, pull FULL data from ComputedMetricsProvider
  let displayLabel = label;
  let displayValue = value;
  let displayChange = change;
  let displayDescription = description;
  let displayTrend = trend;
  let displayVariant = variant;

  if (override?.type === "metric" && override.slug !== slug && computed) {
    const resolved = computed.getBySlug(override.slug);
    if (resolved) {
      displayLabel = resolved.label;
      displayValue = resolved.value;
      displayChange = resolved.change;
      displayDescription = resolved.description;
      displayTrend = resolved.change?.startsWith("+") ? "up"
        : resolved.change?.startsWith("-") ? "down" : "flat";
      displayVariant = "default";
    } else {
      // Fallback: override exists but no computed data yet — show from registry
      const def = metrics?.registry.find((m) => m.slug === override.slug);
      if (def) {
        displayLabel = def.name;
        displayDescription = def.description;
      }
    }
  }

  return (
    <WidgetCard slug={slug} pageId={resolvedPageId} bare>
      <MetricCard
        label={displayLabel}
        value={displayValue}
        change={displayChange}
        description={displayDescription}
        icon={icon}
        trend={displayTrend}
        variant={displayVariant}
        loading={loading}
      />
    </WidgetCard>
  );
}
