"use client";

import { useMemo, type ReactNode } from "react";
import type { MetricValue, ResolvedSlotData } from "@burnless/engine";
import { AreaChartWidget, MultiLineChart, chartColors } from "@/components/charts";
import { ChartCard, PageGrid, type DefaultLayoutItem } from "@/components/ui";
import { PageLayoutProvider, usePageLayoutContext } from "@/components/providers/page-layout-context";
import { ComputedMetricsProvider } from "@/components/providers/computed-metrics-context";
import { ExportDropdown } from "@/components/reports/export-dropdown";
import { PageProvider } from "@/components/providers/page-context";
import { CardCatalogProvider, type CardCatalogValue } from "@/components/providers/card-catalog-context";
import { SwappableMetricCard } from "@/components/ui/swappable-metric-card";
import { useMetrics } from "@/components/providers/metrics-context";
import { CATEGORY_META, getMetricDef, getMetricDependencyTree, getMetricDependents } from "@burnless/engine";
import { formatCurrency } from "@burnless/types";

interface RunwayViewProps {
  cashPosition: MetricValue[];
  netBurnRate: MetricValue[];
  runway: MetricValue[];
  grossBurnRate: MetricValue[];
  startingCash: number;
  companyName?: string;
  scenarioName?: string;
  resolvedSlotData: ResolvedSlotData[];
}

export function RunwayView({ cashPosition, netBurnRate, runway, grossBurnRate, startingCash, companyName, scenarioName, resolvedSlotData }: RunwayViewProps) {
  const findSlot = (slug: string) => resolvedSlotData.find(s => s.content.slug === slug);
  const latest = cashPosition[cashPosition.length - 1];
  const latestBurn = netBurnRate[netBurnRate.length - 1];
  const latestRunway = runway[runway.length - 1];

  // Find zero-cash month
  const zeroCashMonth = cashPosition.find((c) => c.value <= 0);

  // Prepare data for burn comparison chart
  const burnData = grossBurnRate.map((g, i) => ({
    month: g.month,
    gross: g.value,
    net: netBurnRate[i]?.value ?? 0,
  }));

  const handleExportCSV = () => {
    const headers = ["Month", "Cash Position", "Net Burn Rate", "Gross Burn Rate", "Runway (Months)"];
    const rows = [headers.join(",")];
    for (let i = 0; i < cashPosition.length; i++) {
      rows.push([
        cashPosition[i]!.month,
        String(Math.round(cashPosition[i]!.value)),
        String(Math.round(netBurnRate[i]?.value ?? 0)),
        String(Math.round(grossBurnRate[i]?.value ?? 0)),
        String(Math.round(runway[i]?.value ?? 0)),
      ].join(","));
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "runway-analysis.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    const { generateRunwaySummaryPDF, downloadPDF } = await import("@/lib/pdf-export");
    const doc = await generateRunwaySummaryPDF(
      {
        startingCash,
        netBurnRate: latestBurn?.value ?? 0,
        grossBurnRate: grossBurnRate[grossBurnRate.length - 1]?.value ?? 0,
        runwayMonths: latestRunway?.value ?? 0,
        cashPosition,
      },
      {
        title: "Runway Summary",
        companyName: companyName ?? "Company",
        scenarioName: scenarioName ?? "Base",
      }
    );
    downloadPDF(doc, "runway-summary");
  };

  // ── Context wiring ──────────────────────────────────────────────────────
  const { registry, openFormulaViewer } = useMetrics();
  const usedSlugs = useMemo(() => new Set(["startingCash", "currentCash", "netBurnRate", "runway"]), []);
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

  const fc = (v: number) => formatCurrency(v, "USD", undefined, { compact: true });

  const defaultLayoutLG: DefaultLayoutItem[] = useMemo(() => [
    { i: "export",        x: 0,  w: 12, h: 2, minH: 2 },
    { i: "metric-0", x: 0, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "metric-1", x: 3, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "metric-2", x: 6, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "metric-3", x: 9, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "cash-charts",   x: 0,  w: 12, h: 12, minH: 8 },
    { i: "burn-chart",    x: 0,  w: 12, h: 12, minH: 8 },
    { i: "warning",       x: 0,  w: 12, h: 3, minH: 2 },
  ], []);

  const defaultLayoutSM: DefaultLayoutItem[] = useMemo(() => [
    { i: "export",        x: 0,  w: 6, h: 2, minH: 2 },
    { i: "metric-0", x: 0, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "metric-1", x: 3, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "metric-2", x: 0, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "metric-3", x: 3, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "cash-charts",   x: 0,  w: 6, h: 12, minH: 8 },
    { i: "burn-chart",    x: 0,  w: 6, h: 12, minH: 8 },
    { i: "warning",       x: 0,  w: 6, h: 3, minH: 2 },
  ], []);

  const metricCards = useMemo((): Array<{ slug: string; label: string; value: string; change?: string; description?: string; lowerIsBetter?: boolean; sparkData?: number[]; metricStyle?: { icon: string; color: string; href: string }; hasData?: boolean }> => [
    {
      slug: "startingCash",
      label: "Starting Cash",
      value: fc(startingCash),
      sparkData: findSlot("startingCash")?.sparkData,
      metricStyle: findSlot("startingCash")?.metricStyle,
      hasData: findSlot("startingCash")?.hasData,
    },
    {
      slug: "currentCash",
      label: "Current Cash",
      value: fc(latest?.value ?? 0),
      sparkData: findSlot("currentCash")?.sparkData,
      metricStyle: findSlot("currentCash")?.metricStyle,
      hasData: findSlot("currentCash")?.hasData,
    },
    {
      slug: "netBurnRate",
      label: "Net Burn Rate",
      value: fc(latestBurn?.value ?? 0),
      description: "Latest month",
      lowerIsBetter: true,
      sparkData: findSlot("netBurnRate")?.sparkData,
      metricStyle: findSlot("netBurnRate")?.metricStyle,
      hasData: findSlot("netBurnRate")?.hasData,
    },
    {
      slug: "runway",
      label: "Runway",
      value: latestRunway && latestRunway.value < 999 ? `${Math.round(latestRunway.value)} months` : "\u221e",
      description: zeroCashMonth ? `Cash runs out ~${zeroCashMonth.month}` : "Sufficient runway",
      sparkData: findSlot("runway")?.sparkData,
      metricStyle: findSlot("runway")?.metricStyle,
      hasData: findSlot("runway")?.hasData,
    },
  ], [startingCash, latest, latestBurn, latestRunway, zeroCashMonth, resolvedSlotData]);

  const widgets = useMemo(() => ({
    "export": (
      <div className="flex items-center justify-between">
        <div />
        <ExportDropdown onExportCSV={handleExportCSV} onExportPDF={handleExportPDF} />
      </div>
    ),
    ...Object.fromEntries(
      metricCards.map((card, i) => [
        `metric-${i}`,
        <SwappableMetricCard
          key={`metric-${i}`}
          slug={card.slug}
          label={card.label}
          value={card.value}
          change={card.change}
          description={card.description}
          lowerIsBetter={card.lowerIsBetter}
          sparkData={card.sparkData}
          metricStyle={card.metricStyle}
          hasData={card.hasData}
          stagger={i}
        />,
      ])
    ),
    "cash-charts": (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Cash Position Over Time" subtitle="Projected ending cash balance">
          <AreaChartWidget data={cashPosition} color={chartColors.success} />
        </ChartCard>
        <ChartCard title="Runway Projection" subtitle="Months of runway remaining">
          <AreaChartWidget
            data={runway.map((r) => ({ ...r, value: Math.min(r.value, 60) }))}
            color={chartColors.info}
            formatValue={(v) => `${Math.round(v)}mo`}
          />
        </ChartCard>
      </div>
    ),
    "burn-chart": (
      <ChartCard title="Gross vs Net Burn Rate" subtitle="Monthly expense comparison">
        <MultiLineChart
          data={burnData}
          lines={[
            { dataKey: "gross", label: "Gross Burn", color: chartColors.danger },
            { dataKey: "net", label: "Net Burn", color: chartColors.warning, dashed: true },
          ]}
        />
      </ChartCard>
    ),
    "warning": zeroCashMonth ? (
      <div className="rounded-xl bg-red-50 border border-red-200 p-4">
        <p className="text-sm text-red-800 font-medium">
          Warning: Cash is projected to reach zero in {zeroCashMonth.month}. Consider reducing expenses or raising additional funding.
        </p>
      </div>
    ) : <div />,
  }), [handleExportCSV, handleExportPDF, metricCards, zeroCashMonth, cashPosition, runway, burnData]);

  const staticHiddenWidgets = useMemo(() => zeroCashMonth ? [] : ["warning"], [zeroCashMonth]);

  return (
    <PageLayoutProvider pageId="reports/runway">
      <ComputedMetricsProvider slotData={resolvedSlotData}>
        <PageProvider pageId="reports/runway">
          <CardCatalogProvider value={catalogValue}>
            <RunwayPageGrid
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

function RunwayPageGrid({
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
