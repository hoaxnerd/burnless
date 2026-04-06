"use client";

import { useOptionalMetrics } from "@/components/providers/metrics-context";
import { useOptionalComputedMetrics } from "@/components/providers/computed-metrics-context";
import { usePageId } from "@/components/providers/page-context";
import { HeroKpiCard } from "./hero-kpi-card";
import type { CardContent } from "@burnless/engine";

interface SwappableMetricCardProps {
  slug: string;
  pageId?: string;
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
  stagger?: number;
}

export function SwappableMetricCard({
  slug,
  pageId,
  label,
  value,
  change,
  changeLabel,
  description,
  sparkData,
  metricStyle,
  hasData,
  lowerIsBetter,
  loading,
  stagger = 0,
}: SwappableMetricCardProps) {
  const metrics = useOptionalMetrics();
  const computed = useOptionalComputedMetrics();
  const contextPageId = usePageId();
  const resolvedPageId = pageId || contextPageId || "";

  if (loading) {
    return <HeroKpiCard slug={slug} label={label} value="" hasData={false} pageId={resolvedPageId} stagger={stagger} />;
  }

  let displayLabel = label;
  let displayValue = value;
  let displayChange = change;
  let displayChangeLabel = changeLabel;
  let displayDescription = description;
  let displaySparkData = sparkData;
  let displayMetricStyle = metricStyle;
  let displayHasData = hasData;

  if (metrics) {
    const override: CardContent | null = metrics.getSlotOverride(resolvedPageId, slug) ?? null;
    if (override?.type === "metric" && override.slug !== slug && computed) {
      const resolved = computed.getBySlug(override.slug);
      if (resolved) {
        displayLabel = resolved.label;
        displayValue = resolved.value;
        displayChange = resolved.change;
        displayChangeLabel = resolved.changeLabel;
        displayDescription = resolved.description;
        displaySparkData = resolved.sparkData;
        displayMetricStyle = resolved.metricStyle;
        displayHasData = resolved.hasData;
      } else {
        const def = metrics.registry.find((m) => m.slug === override.slug);
        if (def) {
          displayLabel = def.name;
          displayDescription = def.description;
        }
      }
    }
  }

  return (
    <HeroKpiCard
      slug={slug}
      pageId={resolvedPageId}
      label={displayLabel}
      value={displayValue}
      change={displayChange}
      changeLabel={displayChangeLabel}
      description={displayDescription}
      sparkData={displaySparkData}
      metricStyle={displayMetricStyle}
      hasData={displayHasData}
      lowerIsBetter={lowerIsBetter}
      stagger={stagger}
    />
  );
}
