"use client";

import { useState, useMemo, type ReactNode } from "react";
import { PageGrid, type DefaultLayoutItem } from "@/components/ui";
import { PageLayoutProvider, usePageLayoutContext } from "@/components/providers/page-layout-context";
import { ComputedMetricsProvider } from "@/components/providers/computed-metrics-context";
import { BarChartWidget, VarianceBarChart, chartColors, formatCompactCurrency } from "@/components/charts";
import { ChartCard } from "@/components/ui";
import { ExpenseCategoryChart } from "./expense-category-chart";
import { ExpenseTable } from "./expense-table";
import { ExpenseInsights } from "./expense-insights";
import { AiPageInsights } from "@/components/ai/ai-page-insights";
import { PageProvider } from "@/components/providers/page-context";
import { CardCatalogProvider, type CardCatalogValue } from "@/components/providers/card-catalog-context";
import { SwappableMetricCard } from "@/components/ui/swappable-metric-card";
import { useMetrics } from "@/components/providers/metrics-context";
import { CATEGORY_META, getMetricDef, getMetricDependencyTree, getMetricDependents, type ResolvedSlotData } from "@burnless/engine";
import type { ExpenseDetails } from "@/lib/compute-expenses";

interface MetricPoint {
  month: string;
  value: number;
}

interface SummaryMetrics {
  totalMonthly: number;
  changePercent: number | null;
  personnelCost: number;
  personnelPercent: number;
  opexAmount: number;
  cogsAmount: number;
  anomalyCount: number;
  recurringCount: number;
}

interface ExpensesViewProps {
  summaryMetrics: SummaryMetrics;
  resolvedSlotData: ResolvedSlotData[];
  expenseDetails: ExpenseDetails;
  timeline: MetricPoint[];
  opexTimeline: MetricPoint[];
  cogsTimeline: MetricPoint[];
  budgetTimeline: MetricPoint[] | null;
  scenarioId: string;
}

export function ExpensesView({
  summaryMetrics,
  resolvedSlotData,
  expenseDetails,
  timeline,
  opexTimeline: _opexTimeline,
  cogsTimeline: _cogsTimeline,
  budgetTimeline,
  scenarioId,
}: ExpensesViewProps) {
  const [view, setView] = useState<"overview" | "budget">("overview");
  const { anomalyCount, recurringCount } = summaryMetrics;

  // Render metric cards directly from resolvedSlotData (keyed by slotId)
  const slotById = useMemo(() => {
    const map = new Map<string, ResolvedSlotData>();
    for (const s of resolvedSlotData) map.set(s.slotId, s);
    return map;
  }, [resolvedSlotData]);

  // ── Context wiring ──────────────────────────────────────────────────────
  const { registry, openFormulaViewer } = useMetrics();
  const usedSlugs = useMemo(() => new Set(["totalMonthly", "personnelCost", "anomalies", "recurring"]), []);
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

  // Budget comparison data
  const budgetCompareData = budgetTimeline
    ? timeline.map((t, i) => ({
        month: t.month,
        actual: t.value,
        budget: budgetTimeline[i]?.value ?? 0,
      }))
    : null;

  const varianceData = budgetTimeline
    ? timeline.map((t, i) => ({
        month: t.month,
        value: (budgetTimeline[i]?.value ?? 0) - t.value,
      }))
    : null;

  // ── PageGrid layout ──────────────────────────────────────────────────────

  const defaultLayoutLG: DefaultLayoutItem[] = useMemo(() => [
    { i: "metric-0", x: 0, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "metric-1", x: 3, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "metric-2", x: 6, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "metric-3", x: 9, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "ai-insights",  x: 0, w: 12, h: 4, minH: 3 },
    { i: "insights",     x: 0, w: 12, h: 4, minH: 3 },
    { i: "charts",       x: 0, w: 12, h: 14, minH: 8 },
    { i: "table",        x: 0, w: 12, h: 16, minH: 8 },
  ], []);

  const defaultLayoutSM: DefaultLayoutItem[] = useMemo(() => [
    { i: "metric-0", x: 0, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "metric-1", x: 3, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "metric-2", x: 0, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "metric-3", x: 3, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "ai-insights",  x: 0, w: 6, h: 4, minH: 3 },
    { i: "insights",     x: 0, w: 6, h: 4, minH: 3 },
    { i: "charts",       x: 0, w: 6, h: 14, minH: 8 },
    { i: "table",        x: 0, w: 6, h: 16, minH: 8 },
  ], []);

  // Page-specific lowerIsBetter flags (expenses going up = bad)
  const lowerIsBetterSlugs = useMemo(() => new Set(["totalMonthly"]), []);

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
        page="expenses"
        scenarioId={scenarioId}
        pageData={{
          subcategoryBreakdown: expenseDetails.subcategoryBreakdown,
          anomalyCount,
          recurringCount,
        }}
      />
    ),
    "insights": (
      <div className="animate-fade-in">
        <ExpenseInsights
          breakdown={expenseDetails.subcategoryBreakdown}
          lineItems={expenseDetails.lineItems}
          totalMonthly={summaryMetrics.totalMonthly}
          anomalyCount={anomalyCount}
          recurringCount={recurringCount}
        />
      </div>
    ),
    "charts": (
      <div className="space-y-6">
        {/* View toggle */}
        <div className="flex items-center gap-1 rounded-lg bg-surface-100 p-1 w-fit">
          <button
            onClick={() => setView("overview")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              view === "overview"
                ? "bg-surface-0 text-surface-900 shadow-sm"
                : "text-surface-500 hover:text-surface-700"
            }`}
          >
            Category Overview
          </button>
          {budgetTimeline && (
            <button
              onClick={() => setView("budget")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                view === "budget"
                  ? "bg-surface-0 text-surface-900 shadow-sm"
                  : "text-surface-500 hover:text-surface-700"
              }`}
            >
              Budget vs Actuals
            </button>
          )}
        </div>

        {view === "overview" ? (
          <ExpenseCategoryChart
            breakdown={expenseDetails.subcategoryBreakdown}
            monthlyBySubcategory={expenseDetails.monthlyBySubcategory}
            subcategories={expenseDetails.subcategories}
            totalMonthly={summaryMetrics.totalMonthly}
          />
        ) : budgetCompareData && varianceData ? (
          <div className="space-y-6">
            <ChartCard
              title="Budget vs Forecast"
              subtitle="Comparing your locked budget against the current forecast"
            >
              <BarChartWidget
                data={budgetCompareData}
                bars={[
                  { dataKey: "budget", label: "Budget", color: chartColors.gray },
                  { dataKey: "actual", label: "Forecast", color: chartColors.brand },
                ]}
              />
            </ChartCard>

            <ChartCard
              title="Budget Variance"
              subtitle="Green = under budget, Red = over budget"
            >
              <VarianceBarChart data={varianceData} />
            </ChartCard>

            <div className="rounded-xl bg-surface-0 border border-surface-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-surface-200">
                <h2 className="text-lg font-semibold text-surface-900">Monthly Variance Detail</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-surface-200 bg-surface-50">
                      <th scope="col" className="text-left px-6 py-3 text-xs font-medium text-surface-500 uppercase">Month</th>
                      <th scope="col" className="text-right px-6 py-3 text-xs font-medium text-surface-500 uppercase">Budget</th>
                      <th scope="col" className="text-right px-6 py-3 text-xs font-medium text-surface-500 uppercase">Forecast</th>
                      <th scope="col" className="text-right px-6 py-3 text-xs font-medium text-surface-500 uppercase">Variance</th>
                      <th scope="col" className="text-right px-6 py-3 text-xs font-medium text-surface-500 uppercase">% Diff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {budgetCompareData.map((row) => {
                      const variance = row.budget - row.actual;
                      const pct = row.budget > 0 ? ((variance / row.budget) * 100).toFixed(1) : "0.0";
                      const isGood = variance >= 0;
                      return (
                        <tr key={row.month} className="border-b border-surface-100 hover:bg-surface-50 transition-colors">
                          <td className="px-6 py-3 text-sm text-surface-900">{formatMonthLabel(row.month)}</td>
                          <td className="px-6 py-3 text-right text-sm text-surface-700">{formatCompactCurrency(row.budget)}</td>
                          <td className="px-6 py-3 text-right text-sm text-surface-700">{formatCompactCurrency(row.actual)}</td>
                          <td className={`px-6 py-3 text-right text-sm font-medium ${isGood ? "text-green-600" : "text-red-600"}`}>
                            <span className="sr-only">{isGood ? "Under budget" : "Over budget"}:</span>
                            {isGood ? "+" : ""}{formatCompactCurrency(variance)}
                          </td>
                          <td className={`px-6 py-3 text-right text-sm font-medium ${isGood ? "text-green-600" : "text-red-600"}`}>
                            {isGood ? "+" : ""}{pct}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    ),
    "table": (
      <ExpenseTable
        lineItems={expenseDetails.lineItems}
        subcategories={expenseDetails.subcategories}
      />
    ),
  }), [slotById, lowerIsBetterSlugs, summaryMetrics, expenseDetails, scenarioId, view, budgetTimeline, budgetCompareData, varianceData]);

  return (
    <PageLayoutProvider pageId="expenses">
      <ComputedMetricsProvider slotData={resolvedSlotData}>
        <PageProvider pageId="expenses">
          <CardCatalogProvider value={catalogValue}>
            <ExpensesPageGrid
              widgets={widgets}
              defaultLayoutLG={defaultLayoutLG}
              defaultLayoutSM={defaultLayoutSM}
            />
          </CardCatalogProvider>
        </PageProvider>
      </ComputedMetricsProvider>
    </PageLayoutProvider>
  );
}

function ExpensesPageGrid({
  widgets,
  defaultLayoutLG,
  defaultLayoutSM,
}: {
  widgets: Record<string, ReactNode>;
  defaultLayoutLG: DefaultLayoutItem[];
  defaultLayoutSM: DefaultLayoutItem[];
}) {
  const layout = usePageLayoutContext();
  return (
    <PageGrid
      widgets={widgets}
      defaultLayoutLG={defaultLayoutLG}
      defaultLayoutSM={defaultLayoutSM}
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

function formatMonthLabel(mk: string): string {
  const parts = mk.split("-");
  const year = parts[0] ?? "";
  const month = parts[1] ?? "0";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[parseInt(month, 10) - 1]} ${year}`;
}
