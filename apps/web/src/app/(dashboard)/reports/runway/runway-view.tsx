"use client";

import { useMemo } from "react";
import { AiGate } from "@/components/ai/ai-gate";
import type { MetricValue, ResolvedSlotData } from "@burnless/engine";
import { AreaChartWidget, MultiLineChart, chartColors } from "@/components/charts";
import { ChartCard, ConnectedPageGrid, type DefaultLayoutItem } from "@/components/ui";
import { PageLayoutProvider } from "@/components/providers/page-layout-context";
import { ComputedMetricsProvider } from "@/components/providers/computed-metrics-context";
import { ExportDropdown } from "@/components/reports/export-dropdown";
import { PageProvider } from "@/components/providers/page-context";
import { CardCatalogProvider, type CardCatalogValue } from "@/components/providers/card-catalog-context";
import { SwappableMetricCard } from "@/components/ui/swappable-metric-card";
import { useMetrics } from "@/components/providers/metrics-context";
import { CATEGORY_META, getMetricDef, getMetricDependencyTree, getMetricDependents } from "@burnless/engine";

interface RunwayViewProps {
  cashPosition: MetricValue[];
  netBurnRate: MetricValue[];
  runway: MetricValue[];
  grossBurnRate: MetricValue[];
  startingCash: number;
  companyName?: string;
  scenarioName?: string;
  currentMonth: string;
  resolvedSlotData: ResolvedSlotData[];
}

export function RunwayView({ cashPosition, netBurnRate, runway, grossBurnRate, startingCash, companyName, scenarioName, currentMonth, resolvedSlotData }: RunwayViewProps) {
  // Render metric cards directly from resolvedSlotData (keyed by slotId)
  const slotById = useMemo(() => {
    const map = new Map<string, ResolvedSlotData>();
    for (const s of resolvedSlotData) map.set(s.slotId, s);
    return map;
  }, [resolvedSlotData]);

  // FMT-2: read headline KPIs at the REAL current calendar month (currentMonth),
  // not the end of the now-full-horizon series (Phase B horizon contract).
  const atMonth = (series: MetricValue[]) =>
    series.find((m) => m.month === currentMonth) ?? series[series.length - 1];
  const latest = atMonth(cashPosition);
  const latestBurn = atMonth(netBurnRate);
  const latestRunway = atMonth(runway);

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
        grossBurnRate: atMonth(grossBurnRate)?.value ?? 0,
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

  const defaultLayoutLG: DefaultLayoutItem[] = useMemo(() => [
    { i: "export",        x: 0,  w: 12, h: 2, minH: 2 },
    { i: "metric-0", x: 0, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "metric-1", x: 3, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "metric-2", x: 6, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "metric-3", x: 9, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "cash-position-chart",     x: 0, w: 6, h: 12, minW: 4, minH: 8 },
    { i: "runway-projection-chart", x: 6, w: 6, h: 12, minW: 4, minH: 8 },
    { i: "burn-chart",    x: 0,  w: 12, h: 12, minH: 8 },
    { i: "warning",       x: 0,  w: 12, h: 3, minH: 2 },
  ], []);

  const defaultLayoutSM: DefaultLayoutItem[] = useMemo(() => [
    { i: "export",        x: 0,  w: 6, h: 2, minH: 2 },
    { i: "metric-0", x: 0, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "metric-1", x: 3, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "metric-2", x: 0, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "metric-3", x: 3, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "cash-position-chart",     x: 0, w: 6, h: 12, minH: 8 },
    { i: "runway-projection-chart", x: 0, w: 6, h: 12, minH: 8 },
    { i: "burn-chart",    x: 0,  w: 6, h: 12, minH: 8 },
    { i: "warning",       x: 0,  w: 6, h: 3, minH: 2 },
  ], []);

  // Page-specific lowerIsBetter flags
  const lowerIsBetterSlugs = useMemo(() => new Set(["netBurnRate"]), []);

  const widgets = useMemo(() => ({
    "export": (
      <div className="flex items-center justify-between">
        <div />
        <ExportDropdown onExportCSV={handleExportCSV} onExportPDF={handleExportPDF} />
      </div>
    ),
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
    "cash-position-chart": (
      <ChartCard title="Cash Position Over Time" subtitle="Projected ending cash balance">
        <AreaChartWidget data={cashPosition} color={chartColors.success} />
      </ChartCard>
    ),
    "runway-projection-chart": (
      <ChartCard title="Runway Projection" subtitle="Months of runway remaining">
        <AreaChartWidget
          data={runway.map((r) => ({ ...r, value: Math.min(r.value, 60) }))}
          color={chartColors.info}
          formatValue={(v) => `${Math.round(v)}mo`}
        />
      </ChartCard>
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
      <AiGate feature="insights" hideWhenOff>
      <div className="rounded-xl bg-red-50 border border-red-200 p-4">
        <p className="text-sm text-red-800 font-medium">
          Warning: Cash is projected to reach zero in {zeroCashMonth.month}. Consider reducing expenses or raising additional funding.
        </p>
      </div>
      </AiGate>
    ) : <div />,
  }), [handleExportCSV, handleExportPDF, slotById, lowerIsBetterSlugs, zeroCashMonth, cashPosition, runway, burnData]);

  const staticHiddenWidgets = useMemo(() => zeroCashMonth ? [] : ["warning"], [zeroCashMonth]);

  return (
    <PageLayoutProvider pageId="reports/runway">
      <ComputedMetricsProvider slotData={resolvedSlotData}>
        <PageProvider pageId="reports/runway">
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

