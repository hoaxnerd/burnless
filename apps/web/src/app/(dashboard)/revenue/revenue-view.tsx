"use client";

import { useMemo } from "react";

import { ConnectedPageGrid, type DefaultLayoutItem } from "@/components/ui";
import { PageLayoutProvider } from "@/components/providers/page-layout-context";
import { ComputedMetricsProvider } from "@/components/providers/computed-metrics-context";
import { AreaChartWidget, chartColors } from "@/components/charts";
import { ChartCard } from "@/components/ui";
import { RevenueWaterfallChart } from "./revenue-waterfall-chart";
import { RevenueStreamBreakdown } from "./revenue-stream-breakdown";
import { RevenueInsights } from "./revenue-insights";
import { AiPageInsights } from "@/components/ai/ai-page-insights";
import { PageProvider } from "@/components/providers/page-context";
import { CardCatalogProvider, type CardCatalogValue } from "@/components/providers/card-catalog-context";
import { SwappableMetricCard } from "@/components/ui/swappable-metric-card";
import { useMetrics } from "@/components/providers/metrics-context";
import { CATEGORY_META, getMetricDef, getMetricDependencyTree, getMetricDependents } from "@burnless/engine";
import type { RevenueDetails } from "@/lib/compute-revenue";
import type { MetricValue, ResolvedSlotData } from "@burnless/engine";

interface RevenueViewProps {
  revenueDetails: RevenueDetails;
  resolvedSlotData: ResolvedSlotData[];
  revenueTimeline: { month: string; value: number }[];
  mrrTimeline: MetricValue[];
  scenarioId: string;
}

export function RevenueView({
  revenueDetails,
  resolvedSlotData,
  revenueTimeline,
  mrrTimeline,
  scenarioId,
}: RevenueViewProps) {
  const { growthMetrics: g, hasSaaS, streamBreakdown, waterfall, monthlyByStream, streamNames } = revenueDetails;

  // Render metric cards directly from resolvedSlotData (keyed by slotId)
  const slotById = useMemo(() => {
    const map = new Map<string, ResolvedSlotData>();
    for (const s of resolvedSlotData) map.set(s.slotId, s);
    return map;
  }, [resolvedSlotData]);

  // ── Context wiring ──────────────────────────────────────────────────────
  const { registry, openFormulaViewer } = useMetrics();
  const usedSlugs = useMemo(
    () => new Set(hasSaaS
      ? ["monthlyRevenue", "mrr", "customers", "churnRate"]
      : ["monthlyRevenue", "annualRunRate", "revenueStreams", "growth"]),
    [hasSaaS],
  );
  const catalogValue: CardCatalogValue = useMemo(() => ({
    registry,
    usedSlugs,
    heroSlugs: [],
    onSelect: () => {},
    onRemove: () => {},
    onViewFormula: openFormulaViewer,
    categoryMeta: CATEGORY_META as Record<string, { label: string }>,
    getDependencyTree: getMetricDependencyTree,
    getDependents: getMetricDependents,
    getMetricDef: getMetricDef as CardCatalogValue["getMetricDef"],
    swapMode: false,
    cardType: "metric" as const,
  }), [registry, usedSlugs, openFormulaViewer]);

  // ── PageGrid layout ──────────────────────────────────────────────────────

  const defaultLayoutLG: DefaultLayoutItem[] = useMemo(() => [
    { i: "metric-0", x: 0, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "metric-1", x: 3, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "metric-2", x: 6, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "metric-3", x: 9, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "ai-insights",   x: 0, w: 12, h: 4, minH: 3 },
    { i: "insights",      x: 0, w: 12, h: 4, minH: 3 },
    { i: "revenue-chart",  x: 0, w: 6, h: 12, minW: 4, minH: 8 },
    { i: "mrr-chart",      x: 6, w: 6, h: 12, minW: 4, minH: 8 },
    { i: "waterfall",     x: 0, w: 12, h: 10, minH: 6 },
    { i: "stream-breakdown", x: 0, w: 12, h: 14, minH: 8 },
  ], []);

  const defaultLayoutSM: DefaultLayoutItem[] = useMemo(() => [
    { i: "metric-0", x: 0, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "metric-1", x: 3, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "metric-2", x: 0, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "metric-3", x: 3, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "ai-insights",   x: 0, w: 6, h: 4, minH: 3 },
    { i: "insights",      x: 0, w: 6, h: 4, minH: 3 },
    { i: "revenue-chart",  x: 0, w: 6, h: 12, minH: 8 },
    { i: "mrr-chart",      x: 0, w: 6, h: 12, minH: 8 },
    { i: "waterfall",     x: 0, w: 6, h: 10, minH: 6 },
    { i: "stream-breakdown", x: 0, w: 6, h: 14, minH: 8 },
  ], []);

  // Page-specific lowerIsBetter flags
  const lowerIsBetterSlugs = useMemo(() => new Set(["churnRate"]), []);

  const widgets = useMemo(() => ({
    ...Object.fromEntries(
      ["metric-0", "metric-1", "metric-2", "metric-3"].map((slotId, i) => {
        const slot = slotById.get(slotId);
        if (!slot) return [slotId, null];
        return [
          slotId,
          <SwappableMetricCard
            key={slotId}
            slug={slot.content.slug}
            label={slot.label}
            value={slot.value}
            change={slot.change}
            changeLabel={slot.changeLabel}
            description={slot.description}
            sparkData={slot.sparkData}
            metricStyle={slot.metricStyle}
            hasData={slot.hasData}
            lowerIsBetter={lowerIsBetterSlugs.has(slot.content.slug)}
            stagger={i}
          />,
        ];
      })
    ),
    "ai-insights": (
      <AiPageInsights
        page="revenue"
        scenarioId={scenarioId}
        pageData={{
          growthMetrics: g,
          streamBreakdown: streamBreakdown.map((s) => ({
            name: s.name,
            type: s.type,
            currentRevenue: s.currentRevenue,
            percentage: s.percentage,
            changePercent: s.changePercent,
          })),
        }}
      />
    ),
    "insights": (
      <div className="animate-fade-in">
        <RevenueInsights
          growthMetrics={g}
          streams={streamBreakdown}
          hasSaaS={hasSaaS}
        />
      </div>
    ),
    "revenue-chart": (
      <ChartCard title="Revenue Over Time" subtitle="Total monthly revenue trend">
        <AreaChartWidget data={revenueTimeline} color={chartColors.brand} />
      </ChartCard>
    ),
    "mrr-chart": hasSaaS ? (
      <ChartCard title="MRR Trend" subtitle="Monthly recurring revenue">
        <AreaChartWidget data={mrrTimeline} color="#14b8a6" />
      </ChartCard>
    ) : <div />,
    "waterfall": hasSaaS ? (
      <RevenueWaterfallChart waterfall={waterfall} />
    ) : <div />,
    "stream-breakdown": (
      <RevenueStreamBreakdown
        streams={streamBreakdown}
        monthlyByStream={monthlyByStream}
        streamNames={streamNames}
        totalRevenue={g.currentRevenue}
        scenarioId={scenarioId}
      />
    ),
  }), [slotById, lowerIsBetterSlugs, g, hasSaaS, revenueDetails, streamBreakdown, waterfall, monthlyByStream, streamNames, revenueTimeline, mrrTimeline, scenarioId]);

  const staticHiddenWidgets = useMemo(() => hasSaaS ? [] : ["waterfall", "mrr-chart"], [hasSaaS]);

  return (
    <PageLayoutProvider pageId="revenue">
      <ComputedMetricsProvider slotData={resolvedSlotData}>
        <PageProvider pageId="revenue">
          <CardCatalogProvider value={catalogValue}>
            <ConnectedPageGrid
              widgets={widgets}
              defaultLayoutLG={defaultLayoutLG}
              defaultLayoutSM={defaultLayoutSM}
              staticHiddenWidgets={staticHiddenWidgets}
            />
          </CardCatalogProvider>
        </PageProvider>
      </ComputedMetricsProvider>
    </PageLayoutProvider>
  );
}

