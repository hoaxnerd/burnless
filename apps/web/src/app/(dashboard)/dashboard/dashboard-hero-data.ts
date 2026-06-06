import {
  DEFAULT_HERO_CARDS,
  getHeroSwaps,
  extractMetricValue,
  formatMetricValue,
  getMetricMissingDataHint,
  getMetricDef,
  isMetricDataAvailable,
  pctChange as pctChangeValue,
  type ComputedMetrics,
} from "@burnless/engine";
import { type HeroCardDatum, type SwapCardDatum } from "./hero-card-grid";
import { formatCurrency, pctChange, sparkline } from "./dashboard-helpers";
import { getMetricSubLabel } from "@/lib/build-slot-metrics";
import { type CurrencyCode } from "@burnless/types";

const DEFAULT_METRIC_STYLES: Record<string, { icon: string; color: string; href: string }> = {
  cashPosition: { icon: "Wallet", color: "emerald", href: "/funding" },
  netBurnRate: { icon: "Flame", color: "orange", href: "/expenses" },
  cashRunwayMonths: { icon: "Clock", color: "blue", href: "/scenarios" },
  mrr: { icon: "TrendingUp", color: "teal", href: "/revenue" },
};

export function buildHeroCards(
  heroSlugs: string[],
  metrics: ComputedMetrics,
  currentMonth: string,
  prevMonth: string,
  slugHasData: Record<string, boolean>,
  currency: CurrencyCode = "USD",
  locale?: string,
): HeroCardDatum[] {
  return heroSlugs.map((slug, i) => {
    const def = getMetricDef(slug);
    const hasData: boolean = slug in slugHasData
      ? slugHasData[slug]!
      : isMetricDataAvailable(metrics, slug, currentMonth);

    const currentVal = extractMetricValue(metrics, slug, currentMonth) ?? 0;
    const prevVal = extractMetricValue(metrics, slug, prevMonth) ?? 0;

    // Format value based on metric definition
    let formattedValue: string;
    if (!hasData) {
      formattedValue = def?.format === "months" ? "-- mo" : "$---";
    } else if (def) {
      formattedValue = def.format === "currency"
        ? formatCurrency(currentVal, currency, locale, { compact: true })
        : formatMetricValue(currentVal, def.format);
    } else {
      formattedValue = formatCurrency(currentVal, currency, locale, { compact: true });
    }

    // MoM change
    let change: string | undefined;
    let changeLabel: string | undefined;
    if (hasData && prevVal !== 0) {
      if (def?.format === "percent") {
        const diff = currentVal - prevVal;
        if (diff !== 0 && Number.isFinite(diff)) {
          change = `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}pp`;
          changeLabel = "vs last month";
        }
      } else {
        change = pctChange(currentVal, prevVal) ?? undefined;
        changeLabel = change ? "vs last month" : undefined;
      }
    }

    // Sparkline data
    const series = (metrics as unknown as Record<string, Array<{ month: string; value: number }>>)[slug];
    const sparkData = hasData && Array.isArray(series) ? sparkline(series, 8, currentMonth) : undefined;

    // Resolve metricStyle: use DEFAULT_METRIC_STYLES for defaults, registry for others
    const metricStyle = DEFAULT_METRIC_STYLES[slug]
      ?? (def ? { icon: def.icon, color: def.color, href: def.href } : undefined);

    return {
      hasData,
      props: {
        slug,
        label: def?.name ?? slug,
        value: formattedValue,
        change,
        changeLabel,
        description: !hasData
          ? (getMetricMissingDataHint(slug) ?? (def?.description))
          : getMetricSubLabel(slug, metrics, currentMonth, currency, locale),
        sparkData,
        metricStyle,
        lowerIsBetter: slug === "netBurnRate",
        hasData,
      },
    };
  });
}

export function buildHeroSwapCards(
  heroSlugs: string[],
  heroCards: HeroCardDatum[],
  metrics: ComputedMetrics,
  currentMonth: string,
  prevMonth: string,
  currency: CurrencyCode = "USD",
  locale?: string,
): SwapCardDatum[] {
  const heroSwaps = getHeroSwaps(DEFAULT_HERO_CARDS, metrics, currentMonth);
  const heroSwapCards: SwapCardDatum[] = [];
  for (let i = 0; i < heroSwaps.length; i++) {
    const swap = heroSwaps[i];
    if (!swap || !swap.replacedSlug) continue;

    // Find the actual index in heroSlugs for this default slug
    const defaultSlug = DEFAULT_HERO_CARDS[i]!;
    const heroIndex = heroSlugs.indexOf(defaultSlug);
    if (heroIndex === -1) continue; // User removed this default card

    const swapCurrentVal = extractMetricValue(metrics, swap.displaySlug, currentMonth) ?? 0;
    const swapPrevVal = extractMetricValue(metrics, swap.displaySlug, prevMonth) ?? 0;
    const formattedSwapValue = swap.displayDef.format === "currency"
      ? formatCurrency(swapCurrentVal, currency, locale, { compact: true })
      : formatMetricValue(swapCurrentVal, swap.displayDef.format);

    let swapChange: string | undefined;
    if (swap.displayDef.format === "percent") {
      const diff = swapCurrentVal - swapPrevVal;
      if (swapPrevVal !== 0 && diff !== 0 && Number.isFinite(diff)) {
        swapChange = `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}pp`;
      }
    } else if (swapPrevVal !== 0) {
      const pct = pctChangeValue(swapCurrentVal, swapPrevVal) ?? 0;
      if (pct !== 0 && Number.isFinite(pct)) {
        swapChange = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
      }
    }

    const swapSeries = (metrics as unknown as Record<string, Array<{ month: string; value: number }>>)[swap.displaySlug];
    const _swapSparkData = Array.isArray(swapSeries) ? sparkline(swapSeries, 8, currentMonth) : undefined;

    heroSwapCards.push({
      slotIndex: heroIndex,
      originalLabel: heroCards[heroIndex]?.props.label ?? "",
      originalSlug: swap.replacedSlug,
      restoreHint: swap.restoreHint ?? getMetricMissingDataHint(swap.replacedSlug),
      props: {
        slug: swap.displaySlug,
        label: swap.displayDef.name,
        value: formattedSwapValue,
        change: swapChange,
        changeLabel: swapChange ? "vs last month" : undefined,
        metricStyle: {
          icon: swap.displayDef.icon,
          color: swap.displayDef.color,
          href: swap.displayDef.href,
        },
      },
    });
  }
  return heroSwapCards;
}
