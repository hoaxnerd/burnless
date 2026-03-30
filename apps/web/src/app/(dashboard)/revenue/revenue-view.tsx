"use client";

import { useMemo } from "react";
import { DollarSign, TrendingUp, Users, BarChart3 } from "lucide-react";
import { PageGrid, type DefaultLayoutItem } from "@/components/ui";
import { usePageLayout } from "@/components/ui/use-page-layout";
import { AreaChartWidget, chartColors } from "@/components/charts";
import { ChartCard } from "@/components/ui";
import { RevenueWaterfallChart } from "./revenue-waterfall-chart";
import { RevenueStreamBreakdown } from "./revenue-stream-breakdown";
import { RevenueInsights } from "./revenue-insights";
import { AiPageInsights } from "@/components/ai/ai-page-insights";
import { PageProvider } from "@/components/providers/page-context";
import { CardCatalogProvider, type CardCatalogValue } from "@/components/providers/card-catalog-context";
import { MetricCardsGrid, type MetricCardConfig } from "@/components/ui/metric-cards-grid";
import { useMetrics } from "@/components/providers/metrics-context";
import { CATEGORY_META, getMetricDef, getMetricDependencyTree, getMetricDependents } from "@burnless/engine";
import { formatCurrency } from "@burnless/types";
import type { RevenueDetails } from "@/lib/compute-revenue";
import type { MetricValue } from "@burnless/engine";

interface RevenueViewProps {
  revenueDetails: RevenueDetails;
  revenueTimeline: { month: string; value: number }[];
  mrrTimeline: MetricValue[];
  scenarioId: string;
}

export function RevenueView({
  revenueDetails,
  revenueTimeline,
  mrrTimeline,
  scenarioId,
}: RevenueViewProps) {
  const { growthMetrics: g, hasSaaS, streamBreakdown, waterfall, monthlyByStream, streamNames } = revenueDetails;

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
  const pageLayout = usePageLayout({ pageId: "revenue" });

  const defaultLayoutLG: DefaultLayoutItem[] = useMemo(() => [
    { i: "metric-cards",  x: 0, w: 12, h: 5, minH: 4 },
    { i: "ai-insights",   x: 0, w: 12, h: 4, minH: 3 },
    { i: "insights",      x: 0, w: 12, h: 4, minH: 3 },
    { i: "trend-charts",  x: 0, w: 12, h: 12, minH: 8 },
    { i: "waterfall",     x: 0, w: 12, h: 10, minH: 6 },
    { i: "stream-breakdown", x: 0, w: 12, h: 14, minH: 8 },
  ], []);

  const defaultLayoutSM: DefaultLayoutItem[] = useMemo(
    () => defaultLayoutLG.map((item) => ({ ...item, x: 0, w: 6 })),
    [defaultLayoutLG]
  );

  const metricCards: MetricCardConfig[] = useMemo(() => {
    const fc = (v: number) => formatCurrency(v, "USD", undefined, { compact: true });
    const first: MetricCardConfig = {
      slug: "monthlyRevenue",
      label: "Monthly Revenue",
      value: fc(g.currentRevenue),
      change: g.revenueGrowthPercent !== 0 ? `${g.revenueGrowthPercent > 0 ? "+" : ""}${g.revenueGrowthPercent.toFixed(1)}%` : undefined,
      description: "MoM growth",
      trend: g.revenueGrowthPercent > 1 ? "up" : g.revenueGrowthPercent < -1 ? "down" : "flat",
      icon: DollarSign,
      variant: g.revenueGrowthPercent > 5 ? "success" : g.revenueGrowthPercent < 0 ? "danger" : "default",
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
          trend: g.mrrGrowthPercent > 1 ? "up" : g.mrrGrowthPercent < -1 ? "down" : "flat",
          icon: TrendingUp,
          variant: "brand" as const,
        },
        {
          slug: "customers",
          label: "Customers",
          value: String(Math.round(g.totalCustomers)),
          description: `ARPA: ${fc(g.arpa)}/mo`,
          icon: Users,
        },
        {
          slug: "churnRate",
          label: "Churn Rate",
          value: `${g.churnRate.toFixed(1)}%`,
          description: `LTV: ${fc(g.ltv)}`,
          icon: BarChart3,
          variant: g.churnRate > 5 ? "danger" : g.churnRate > 3 ? "warning" : "success",
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
        icon: TrendingUp,
        variant: "brand" as const,
      },
      {
        slug: "revenueStreams",
        label: "Revenue Streams",
        value: String(revenueDetails.streamCount),
        description: "Active sources",
        icon: BarChart3,
      },
      {
        slug: "growth",
        label: "Growth",
        value: `${g.revenueGrowthPercent > 0 ? "+" : ""}${g.revenueGrowthPercent.toFixed(1)}%`,
        description: g.doublingTimeMonths ? `Doubles in ${Math.ceil(g.doublingTimeMonths)}mo` : "vs last month",
        icon: TrendingUp,
        variant: g.revenueGrowthPercent > 5 ? "success" : g.revenueGrowthPercent < 0 ? "danger" : "default",
      },
    ];
  }, [g, hasSaaS, revenueDetails.streamCount]);

  const widgets = useMemo(() => ({
    "metric-cards": <MetricCardsGrid cards={metricCards} />,
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
    <PageProvider pageId="revenue">
      <CardCatalogProvider value={catalogValue}>
        <PageGrid
          widgets={widgets}
          defaultLayoutLG={defaultLayoutLG}
          defaultLayoutSM={defaultLayoutSM}
          staticHiddenWidgets={staticHiddenWidgets}
          {...pageLayout}
        />
      </CardCatalogProvider>
    </PageProvider>
  );
}
