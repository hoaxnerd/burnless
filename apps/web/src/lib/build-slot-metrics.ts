/**
 * Build display data for a single metric slot from computed metrics.
 * Generalizes dashboard-hero-data.ts buildHeroCards() into a reusable utility.
 * Runs server-side only.
 */

import {
  extractMetricValue,
  formatMetricValue,
  getMetricDef,
  getMetricMissingDataHint,
  isMetricDataAvailable,
  type ComputedMetrics,
  type ResolvedSlotData,
} from "@burnless/engine";

/** Extract last N values from a metric series for sparklines.
 *  When upToMonth is provided, only includes data up to that month (inclusive)
 *  so the sparkline matches the MoM delta and doesn't include forecast data. */
function sparkline(data: Array<{ month: string; value: number }>, n = 8, upToMonth?: string): number[] {
  const filtered = upToMonth ? data.filter((d) => d.month <= upToMonth) : data;
  return filtered.slice(-n).map((d) => d.value);
}

/**
 * Build display data for a single metric slot from computed metrics.
 * Follows the same formatting logic as buildHeroCards() in dashboard-hero-data.ts.
 */
export function buildSlotMetricCard(
  slug: string,
  metrics: ComputedMetrics,
  currentMonth: string,
  prevMonth: string,
  slotId?: string,
): ResolvedSlotData {
  // 1. Get metric definition from registry
  const def = getMetricDef(slug);

  // 2. Check if data is available for this month
  const hasData = isMetricDataAvailable(metrics, slug, currentMonth);

  // 3. Extract current + previous values
  const currentVal = extractMetricValue(metrics, slug, currentMonth) ?? 0;
  const prevVal = extractMetricValue(metrics, slug, prevMonth) ?? 0;

  // 4. Format value using def.format (currency, percent, months, ratio, etc.)
  let value: string;
  if (!hasData) {
    value = def?.format === "months" ? "-- mo" : "$---";
  } else if (def) {
    value = formatMetricValue(currentVal, def.format);
  } else {
    // Unknown slug — fall back to currency compact
    if (Math.abs(currentVal) >= 1_000_000) {
      value = `$${(currentVal / 1_000_000).toFixed(1)}M`;
    } else if (Math.abs(currentVal) >= 1_000) {
      value = `$${(currentVal / 1_000).toFixed(0)}k`;
    } else {
      value = `$${currentVal.toFixed(0)}`;
    }
  }

  // 5. Calculate MoM change
  let change: string | undefined;
  let changeLabel: string | undefined;
  if (hasData && prevVal !== 0) {
    if (def?.format === "percent") {
      // Show as "+5.0pp" (percentage points)
      const diff = currentVal - prevVal;
      if (diff !== 0 && Number.isFinite(diff)) {
        change = `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}pp`;
        changeLabel = "vs last month";
      }
    } else {
      // Show as "+12.5%" (percentage change)
      const pct = ((currentVal - prevVal) / Math.abs(prevVal)) * 100;
      if (pct !== 0 && Number.isFinite(pct)) {
        change = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
        changeLabel = "vs last month";
      }
    }
  }

  // 6. Extract sparkline (last 8 values from the metric series)
  const series = (metrics as unknown as Record<string, Array<{ month: string; value: number }>>)[slug];
  const sparkData = hasData && Array.isArray(series) ? sparkline(series, 8, currentMonth) : undefined;

  // 7. Return ResolvedSlotData with metricStyle from registry (icon, color, href)
  const metricStyle = def
    ? { icon: def.icon, color: def.color, href: def.href }
    : undefined;

  return {
    slotId: slotId ?? slug,
    content: { type: "metric", slug },
    label: def?.name ?? slug,
    value,
    change,
    changeLabel,
    description: !hasData
      ? (getMetricMissingDataHint(slug) ?? def?.description)
      : undefined,
    sparkData,
    metricStyle,
    hasData,
  };
}

/**
 * Resolve an array of slot configs into display data.
 * For each slot, checks slotOverrides for a custom content pick.
 */
export function resolveSlotMetrics(
  slots: Array<{ id: string; defaultSlug: string }>,
  slotOverrides: Record<string, { type: string; slug: string }>,
  pageId: string,
  metrics: ComputedMetrics,
  currentMonth: string,
  prevMonth: string,
): ResolvedSlotData[] {
  return slots.map((slot) => {
    const overrideKey = `${pageId}:${slot.id}`;
    const override = slotOverrides[overrideKey];
    const effectiveSlug = override?.type === "metric" ? override.slug : slot.defaultSlug;
    return buildSlotMetricCard(effectiveSlug, metrics, currentMonth, prevMonth, slot.id);
  });
}
