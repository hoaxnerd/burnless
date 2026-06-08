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
  pctChange,
  pctOfTotal,
  type ComputedMetrics,
  type ResolvedSlotData,
} from "@burnless/engine";
import { formatCurrency, formatNumber, formatPercent, type CurrencyCode } from "@burnless/types";

/**
 * Metric-level dynamic sub-label (a value-derived description) for a metric.
 *
 * Lives at the METRIC level — keyed by slug, computed from `ComputedMetrics` —
 * so it follows the metric onto any page/slot where it renders (dashboard hero,
 * swap catalog, revenue page, a card swapped onto another page, …). Never
 * hardcode a metric's sub-label per page. Currency formatting stays in the web
 * layer (the engine is currency-agnostic). Returns `undefined` for metrics that
 * have no dynamic sub-label, so callers fall back to the static registry
 * description / missing-data hint.
 */
export function getMetricSubLabel(
  slug: string,
  metrics: ComputedMetrics,
  month: string,
  currency: CurrencyCode = "USD",
  locale?: string,
): string | undefined {
  // Read a sibling metric's value at this month (in-memory; no I/O).
  const v = (s: string) => extractMetricValue(metrics, s, month);
  // Compact currency (engine is currency-agnostic; formatting lives here).
  const fc = (n: number) => formatCurrency(n, currency, locale, { compact: true });
  // Whole-number share, via the engine helper (never inline `a/b*100`).
  const share = (part: number, total: number) => Math.round(pctOfTotal(part, total));

  switch (slug) {
    // ── Revenue ────────────────────────────────────────────────────────────
    case "mrr": {
      // MRR is the *recurring* subset of total revenue; ARR + recurring share
      // explain why MRR < total Monthly Revenue (rest is non-recurring).
      const mrr = v("mrr") ?? 0, total = v("totalRevenue") ?? 0, arr = v("arr") ?? 0;
      if (mrr <= 0 || total <= 0) return undefined;
      return `ARR ${fc(arr)} · ${share(mrr, total)}% of revenue`;
    }
    case "totalRevenue": {
      // Inverse of MRR's label: how much of the top line is recurring.
      const mrr = v("mrr") ?? 0, total = v("totalRevenue") ?? 0;
      if (mrr <= 0 || total <= 0) return undefined;
      return `${fc(mrr)} recurring (${share(mrr, total)}%)`;
    }
    case "arr": {
      const mrr = v("mrr") ?? 0;
      if (mrr <= 0) return undefined;
      return `${fc(mrr)}/mo MRR`;
    }
    case "revenueGrowthRate": {
      // Contrast total-revenue growth (the card) with recurring MRR growth.
      const mrrG = v("mrrGrowthRate");
      if (mrrG == null || mrrG === 0) return undefined;
      return `MRR ${mrrG > 0 ? "+" : ""}${formatMetricValue(mrrG, "percent")}`;
    }

    // ── Cash ───────────────────────────────────────────────────────────────
    case "cashPosition": {
      const runway = v("cashRunwayMonths");
      if (runway == null || runway <= 0) return undefined;
      return `${formatMetricValue(runway, "months")} runway`;
    }
    case "cashRunwayMonths": {
      const burn = v("netBurnRate") ?? 0;
      if (burn <= 0) return undefined;
      return `at ${fc(burn)}/mo net burn`;
    }
    case "netBurnRate": {
      // Net burn = gross burn − revenue; show the gross figure behind it.
      const gross = v("burnRate") ?? 0;
      if (gross <= 0) return undefined;
      return `Gross burn ${fc(gross)}`;
    }
    case "burnRate": {
      const net = v("netBurnRate");
      if (net == null) return undefined;
      return `${fc(net)} net of revenue`;
    }

    // ── Profitability ────────────────────────────────────────────────────────
    case "grossMarginPercent": {
      const gp = v("grossProfit");
      if (gp == null) return undefined;
      return `${fc(gp)} gross profit`;
    }
    case "ebitda": {
      const margin = v("ebitdaMargin");
      if (margin == null) return undefined;
      return `${formatMetricValue(margin, "percent")} margin`;
    }
    case "netIncome": {
      const ni = v("netIncome"), total = v("totalRevenue") ?? 0;
      if (ni == null || total <= 0) return undefined;
      return `${share(ni, total)}% margin`;
    }
    case "ruleOf40": {
      const growth = v("revenueGrowthRate"), margin = v("ebitdaMargin");
      if (growth == null || margin == null) return undefined;
      return `Growth ${formatMetricValue(growth, "percent")} + Margin ${formatMetricValue(margin, "percent")}`;
    }

    // ── SaaS unit economics ──────────────────────────────────────────────────
    case "ltv": {
      const ratio = v("ltvCacRatio");
      if (ratio == null || ratio <= 0) return undefined;
      return `${formatMetricValue(ratio, "multiple")} CAC`;
    }
    case "cac": {
      const payback = v("cacPaybackMonths");
      if (payback == null || payback <= 0) return undefined;
      return `${formatMetricValue(payback, "months")} payback`;
    }
    case "ltvCacRatio": {
      const ltv = v("ltv") ?? 0, cac = v("cac") ?? 0;
      if (ltv <= 0 || cac <= 0) return undefined;
      return `LTV ${fc(ltv)} · CAC ${fc(cac)}`;
    }
    case "arpa": {
      const mrr = v("mrr") ?? 0, customers = v("totalCustomers") ?? 0;
      if (mrr <= 0 || customers <= 0) return undefined;
      return `${fc(mrr)} / ${Math.round(customers)} customers`;
    }
    case "totalCustomers": {
      const added = v("newCustomersPerMonth"), churned = v("churnedCustomersPerMonth");
      if (added == null && churned == null) return undefined;
      return `+${Math.round(added ?? 0)} new · −${Math.round(churned ?? 0)} churned`;
    }
    case "customerChurnRate": {
      const churned = v("churnedCustomersPerMonth");
      if (churned == null || churned <= 0) return undefined;
      return `${Math.round(churned)} customers/mo`;
    }
    case "revenueChurnRate": {
      const churnedMrr = v("churnedMrr");
      if (churnedMrr == null || churnedMrr <= 0) return undefined;
      return `${fc(churnedMrr)} MRR lost/mo`;
    }

    default:
      return undefined;
  }
}

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
  currency: CurrencyCode = "USD",
  locale?: string,
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
    value = def.format === "currency"
      ? formatCurrency(currentVal, currency, locale, { compact: true })
      : formatMetricValue(currentVal, def.format);
  } else {
    // Unknown slug — fall back to currency compact
    value = formatCurrency(currentVal, currency, locale, { compact: true });
  }

  // 5. Calculate MoM change
  let change: string | undefined;
  let changeLabel: string | undefined;
  if (hasData && prevVal !== 0) {
    if (def?.format === "percent") {
      // Show as "+5.0pp" (percentage points)
      const diff = currentVal - prevVal;
      if (diff !== 0 && Number.isFinite(diff)) {
        change = `${diff >= 0 ? "+" : ""}${formatNumber(diff, locale, { decimals: 1 })}pp`;
        changeLabel = "vs last month";
      }
    } else {
      // Show as "+12.5%" (percentage change)
      const pct = pctChange(currentVal, prevVal) ?? 0;
      if (pct !== 0 && Number.isFinite(pct)) {
        change = `${pct >= 0 ? "+" : ""}${formatPercent(pct, locale, 1)}`;
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
      : getMetricSubLabel(slug, metrics, currentMonth, currency, locale),
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
  currency: CurrencyCode = "USD",
  locale?: string,
): ResolvedSlotData[] {
  return slots.map((slot) => {
    const overrideKey = `${pageId}:${slot.id}`;
    const override = slotOverrides[overrideKey];
    const effectiveSlug = override?.type === "metric" ? override.slug : slot.defaultSlug;
    return buildSlotMetricCard(effectiveSlug, metrics, currentMonth, prevMonth, slot.id, currency, locale);
  });
}
