"use client";

import { useState, useMemo } from "react";
import { AlertTriangle, RotateCw, DollarSign, TrendingUp } from "lucide-react";
import { SwappableMetricCard, PageGrid, type DefaultLayoutItem } from "@/components/ui";
import { usePageLayout } from "@/components/ui/use-page-layout";
import { BarChartWidget, VarianceBarChart, chartColors, formatCompactCurrency } from "@/components/charts";
import { ChartCard } from "@/components/ui";
import { ExpenseCategoryChart } from "./expense-category-chart";
import { ExpenseTable } from "./expense-table";
import { ExpenseInsights } from "./expense-insights";
import { AiPageInsights } from "@/components/ai/ai-page-insights";
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
  expenseDetails: ExpenseDetails;
  timeline: MetricPoint[];
  opexTimeline: MetricPoint[];
  cogsTimeline: MetricPoint[];
  budgetTimeline: MetricPoint[] | null;
  scenarioId: string;
}

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
}

export function ExpensesView({
  summaryMetrics,
  expenseDetails,
  timeline,
  opexTimeline: _opexTimeline,
  cogsTimeline: _cogsTimeline,
  budgetTimeline,
  scenarioId,
}: ExpensesViewProps) {
  const [view, setView] = useState<"overview" | "budget">("overview");
  const { totalMonthly, changePercent, personnelCost, personnelPercent, opexAmount: _opexAmount, cogsAmount: _cogsAmount, anomalyCount, recurringCount } = summaryMetrics;

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
  const pageLayout = usePageLayout({ pageId: "expenses" });

  const defaultLayoutLG: DefaultLayoutItem[] = useMemo(() => [
    { i: "metric-cards", x: 0, w: 12, h: 5, minH: 4 },
    { i: "ai-insights",  x: 0, w: 12, h: 4, minH: 3 },
    { i: "insights",     x: 0, w: 12, h: 4, minH: 3 },
    { i: "charts",       x: 0, w: 12, h: 14, minH: 8 },
    { i: "table",        x: 0, w: 12, h: 16, minH: 8 },
  ], []);

  const widgets = useMemo(() => ({
    "metric-cards": (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in">
        <div className="stagger-1 animate-slide-up">
          <SwappableMetricCard
            slug="totalMonthly"
            pageId="expenses"
            label="Total Monthly"
            value={formatCurrency(totalMonthly)}
            change={changePercent !== null ? `${changePercent > 0 ? "+" : ""}${changePercent.toFixed(1)}%` : undefined}
            description="vs last month"
            trend={changePercent !== null ? (changePercent > 1 ? "down" : changePercent < -1 ? "up" : "flat") : undefined}
            icon={DollarSign}
            variant={changePercent !== null && changePercent > 10 ? "danger" : "default"}
          />
        </div>
        <div className="stagger-2 animate-slide-up">
          <SwappableMetricCard
            slug="personnelCost"
            pageId="expenses"
            label="People"
            value={formatCurrency(personnelCost)}
            description={`${personnelPercent.toFixed(0)}% of total`}
            icon={TrendingUp}
            variant="brand"
          />
        </div>
        <div className="stagger-3 animate-slide-up">
          <SwappableMetricCard
            slug="anomalies"
            pageId="expenses"
            label="Anomalies"
            value={String(anomalyCount)}
            description={anomalyCount > 0 ? "Unusual spend detected" : "All spend normal"}
            icon={AlertTriangle}
            variant={anomalyCount > 0 ? "warning" : "default"}
          />
        </div>
        <div className="stagger-4 animate-slide-up">
          <SwappableMetricCard
            slug="recurring"
            pageId="expenses"
            label="Recurring"
            value={String(recurringCount)}
            description={`of ${expenseDetails.lineItems.length} expenses`}
            icon={RotateCw}
            variant="default"
          />
        </div>
      </div>
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
          totalMonthly={totalMonthly}
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
            totalMonthly={totalMonthly}
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
  }), [totalMonthly, changePercent, personnelCost, personnelPercent, anomalyCount, recurringCount, expenseDetails, scenarioId, view, budgetTimeline, budgetCompareData, varianceData]);

  return (
    <PageGrid
      widgets={widgets}
      defaultLayoutLG={defaultLayoutLG}
      {...pageLayout}
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
