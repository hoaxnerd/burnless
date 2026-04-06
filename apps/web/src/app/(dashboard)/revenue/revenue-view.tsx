"use client";

import { useMemo, type ReactNode } from "react";
import { PageGrid, type DefaultLayoutItem } from "@/components/ui";
import { PageLayoutProvider, usePageLayoutContext } from "@/components/providers/page-layout-context";
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
import { formatCurrency } from "@burnless/types";
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

  const findSlot = (slug: string) => {
    const withSpark = resolvedSlotData.find(s => s.content.slug === slug && s.sparkData);
    return withSpark ?? resolvedSlotData.find(s => s.content.slug === slug);
  };

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
    { i: "trend-charts",  x: 0, w: 12, h: 12, minH: 8 },
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
    { i: "trend-charts",  x: 0, w: 6, h: 12, minH: 8 },
    { i: "waterfall",     x: 0, w: 6, h: 10, minH: 6 },
    { i: "stream-breakdown", x: 0, w: 6, h: 14, minH: 8 },
  ], []);

  const metricCards = useMemo((): Array<{ slug: string; label: string; value: string; change?: string; changeLabel?: string; description?: string; lowerIsBetter?: boolean; sparkData?: number[]; metricStyle?: { icon: string; color: string; href: string }; hasData?: boolean }> => {
    const fc = (v: number) => formatCurrency(v, "USD", undefined, { compact: true });
    const first = {
      slug: "monthlyRevenue",
      label: "Monthly Revenue",
      value: fc(g.currentRevenue),
      change: g.revenueGrowthPercent !== 0 ? `${g.revenueGrowthPercent > 0 ? "+" : ""}${g.revenueGrowthPercent.toFixed(1)}%` : undefined,
      changeLabel: "MoM growth",
      description: "MoM growth",
      sparkData: findSlot("monthlyRevenue")?.sparkData,
      metricStyle: findSlot("monthlyRevenue")?.metricStyle,
      hasData: findSlot("monthlyRevenue")?.hasData,
    };

    if (hasSaaS) {
      return [
        first,
        {
          slug: "mrr",
          label: "MRR",
          value: fc(g.currentMrr),
          change: g.mrrGrowthPercent !== 0 ? `${g.mrrGrowthPercent > 0 ? "+" : ""}${g.mrrGrowthPercent.toFixed(1)}%` : undefined,
          description: `ARR: ${fc(g.arr)}`,
          sparkData: findSlot("mrr")?.sparkData,
          metricStyle: findSlot("mrr")?.metricStyle,
          hasData: findSlot("mrr")?.hasData,
        },
        {
          slug: "customers",
          label: "Customers",
          value: String(Math.round(g.totalCustomers)),
          description: `ARPA: ${fc(g.arpa)}/mo`,
          sparkData: findSlot("customers")?.sparkData,
          metricStyle: findSlot("customers")?.metricStyle,
          hasData: findSlot("customers")?.hasData,
        },
        {
          slug: "churnRate",
          label: "Churn Rate",
          value: `${g.churnRate.toFixed(1)}%`,
          description: `LTV: ${fc(g.ltv)}`,
          lowerIsBetter: true,
          sparkData: findSlot("churnRate")?.sparkData,
          metricStyle: findSlot("churnRate")?.metricStyle,
          hasData: findSlot("churnRate")?.hasData,
        },
      ];
    }

    return [
      first,
      {
        slug: "annualRunRate",
        label: "Annual Run Rate",
        value: fc(g.currentRevenue * 12),
        description: "Based on current monthly",
        sparkData: findSlot("annualRunRate")?.sparkData,
        metricStyle: findSlot("annualRunRate")?.metricStyle,
        hasData: findSlot("annualRunRate")?.hasData,
      },
      {
        slug: "revenueStreams",
        label: "Revenue Streams",
        value: String(revenueDetails.streamCount),
        description: "Active sources",
        sparkData: findSlot("revenueStreams")?.sparkData,
        metricStyle: findSlot("revenueStreams")?.metricStyle,
        hasData: findSlot("revenueStreams")?.hasData,
      },
      {
        slug: "growth",
        label: "Growth",
        value: `${g.revenueGrowthPercent > 0 ? "+" : ""}${g.revenueGrowthPercent.toFixed(1)}%`,
        description: g.doublingTimeMonths ? `Doubles in ${Math.ceil(g.doublingTimeMonths)}mo` : "vs last month",
        sparkData: findSlot("growth")?.sparkData,
        metricStyle: findSlot("growth")?.metricStyle,
        hasData: findSlot("growth")?.hasData,
      },
    ];
  }, [g, hasSaaS, revenueDetails.streamCount, resolvedSlotData]);

  const widgets = useMemo(() => ({
    ...Object.fromEntries(
      metricCards.map((card, i) => [
        `metric-${i}`,
        <SwappableMetricCard
          key={`metric-${i}`}
          slug={card.slug}
          label={card.label}
          value={card.value}
          change={card.change}
          changeLabel={card.changeLabel}
          description={card.description}
          lowerIsBetter={card.lowerIsBetter}
          sparkData={card.sparkData}
          metricStyle={card.metricStyle}
          hasData={card.hasData}
          stagger={i}
        />,
      ])
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
    "trend-charts": (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Revenue Over Time" subtitle="Total monthly revenue trend">
          <AreaChartWidget data={revenueTimeline} color={chartColors.brand} />
        </ChartCard>
        {hasSaaS && (
          <ChartCard title="MRR Trend" subtitle="Monthly recurring revenue">
            <AreaChartWidget data={mrrTimeline} color="#14b8a6" />
          </ChartCard>
        )}
      </div>
    ),
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
  }), [metricCards, g, hasSaaS, revenueDetails, streamBreakdown, waterfall, monthlyByStream, streamNames, revenueTimeline, mrrTimeline, scenarioId]);

  const staticHiddenWidgets = useMemo(() => hasSaaS ? [] : ["waterfall"], [hasSaaS]);

  return (
    <PageLayoutProvider pageId="revenue">
      <ComputedMetricsProvider slotData={resolvedSlotData}>
        <PageProvider pageId="revenue">
          <CardCatalogProvider value={catalogValue}>
            <RevenuePageGrid
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

function RevenuePageGrid({
  widgets,
  defaultLayoutLG,
  defaultLayoutSM,
  staticHiddenWidgets,
}: {
  widgets: Record<string, ReactNode>;
  defaultLayoutLG: DefaultLayoutItem[];
  defaultLayoutSM: DefaultLayoutItem[];
  staticHiddenWidgets: string[];
}) {
  const layout = usePageLayoutContext();
  return (
    <PageGrid
      widgets={widgets}
      defaultLayoutLG={defaultLayoutLG}
      defaultLayoutSM={defaultLayoutSM}
      staticHiddenWidgets={staticHiddenWidgets}
      savedLayout={layout.savedLayout}
      onLayoutChange={layout.onLayoutChange}
      closedWidgets={layout.closedWidgets}
      onCloseWidget={layout.onCloseWidget}
      onOpenWidget={layout.onOpenWidget}
      onReset={layout.onReset}
      widgetReadiness={layout.widgetReadiness}
      isLoading={layout.isLoading}
      isEditMode={layout.isEditMode}
      setIsEditMode={layout.setIsEditMode}
    />
  );
}
