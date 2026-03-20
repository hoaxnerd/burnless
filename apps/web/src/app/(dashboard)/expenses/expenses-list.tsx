"use client";

import { useState } from "react";
import { BarChartWidget, VarianceBarChart, chartColors, formatCompactCurrency } from "@/components/charts";
import { ChartCard } from "@/components/ui";

interface ExpenseBreakdown {
  category: string;
  amount: number;
  percentage: number;
  prevAmount: number;
}

interface MetricPoint {
  month: string;
  value: number;
}

interface ExpensesListProps {
  breakdown: ExpenseBreakdown[];
  timeline: MetricPoint[];
  opexTimeline: MetricPoint[];
  cogsTimeline: MetricPoint[];
  scenarioId: string;
  budgetTimeline: MetricPoint[] | null;
}

export function ExpensesList({
  breakdown,
  timeline,
  opexTimeline,
  cogsTimeline,
  scenarioId,
  budgetTimeline,
}: ExpensesListProps) {
  const [view, setView] = useState<"forecast" | "budget">("forecast");

  const stackedData = timeline.map((t, i) => ({
    month: t.month,
    opex: opexTimeline[i]?.value ?? 0,
    cogs: cogsTimeline[i]?.value ?? 0,
  }));

  // Budget vs actuals: combine forecast and budget into one chart dataset
  const budgetCompareData = budgetTimeline
    ? timeline.map((t, i) => ({
        month: t.month,
        actual: t.value,
        budget: budgetTimeline[i]?.value ?? 0,
      }))
    : null;

  // Variance = budget - actual (positive = under budget = good)
  const varianceData = budgetTimeline
    ? timeline.map((t, i) => ({
        month: t.month,
        value: (budgetTimeline[i]?.value ?? 0) - t.value,
      }))
    : null;

  return (
    <div className="space-y-6">
      {/* View toggle */}
      {budgetTimeline && (
        <div className="flex items-center gap-1 rounded-lg bg-surface-100 p-1 w-fit">
          <button
            onClick={() => setView("forecast")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              view === "forecast"
                ? "bg-surface-0 text-surface-900 shadow-sm"
                : "text-surface-500 hover:text-surface-700"
            }`}
          >
            Forecast
          </button>
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
        </div>
      )}

      {view === "forecast" ? (
        <>
          {/* Monthly Expense Chart */}
          <ChartCard title="Monthly Expenses Breakdown" subtitle="Operating expenses vs COGS over time">
            <BarChartWidget
              data={stackedData}
              bars={[
                { dataKey: "opex", label: "Operating Expenses", color: chartColors.brand },
                { dataKey: "cogs", label: "COGS", color: chartColors.warning },
              ]}
            />
          </ChartCard>
        </>
      ) : budgetCompareData && varianceData ? (
        <>
          {/* Budget vs Actuals chart */}
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

          {/* Variance chart */}
          <ChartCard
            title="Budget Variance"
            subtitle="Green = under budget, Red = over budget"
          >
            <VarianceBarChart data={varianceData} />
          </ChartCard>

          {/* Variance table */}
          <div className="rounded-xl bg-surface-0 border border-surface-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-surface-200">
              <h2 className="text-lg font-semibold text-surface-900">
                Monthly Variance Detail
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-surface-200 bg-surface-50">
                    <th className="text-left px-6 py-3 text-xs font-medium text-surface-500 uppercase">
                      Month
                    </th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-surface-500 uppercase">
                      Budget
                    </th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-surface-500 uppercase">
                      Forecast
                    </th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-surface-500 uppercase">
                      Variance
                    </th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-surface-500 uppercase">
                      % Diff
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {budgetCompareData.map((row) => {
                    const variance = row.budget - row.actual;
                    const pct =
                      row.budget > 0
                        ? ((variance / row.budget) * 100).toFixed(1)
                        : "0.0";
                    const isGood = variance >= 0;
                    return (
                      <tr
                        key={row.month}
                        className="border-b border-surface-100 hover:bg-surface-50 transition-colors"
                      >
                        <td className="px-6 py-3 text-sm text-surface-900">
                          {formatMonthLabel(row.month)}
                        </td>
                        <td className="px-6 py-3 text-right text-sm text-surface-700">
                          {formatCompactCurrency(row.budget)}
                        </td>
                        <td className="px-6 py-3 text-right text-sm text-surface-700">
                          {formatCompactCurrency(row.actual)}
                        </td>
                        <td
                          className={`px-6 py-3 text-right text-sm font-medium ${
                            isGood ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {isGood ? "+" : ""}
                          {formatCompactCurrency(variance)}
                        </td>
                        <td
                          className={`px-6 py-3 text-right text-sm font-medium ${
                            isGood ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {isGood ? "+" : ""}
                          {pct}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}

      {/* Category Breakdown Table (shown in both views) */}
      <div className="rounded-xl bg-surface-0 border border-surface-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-surface-900">Expense Categories</h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-surface-200 bg-surface-50">
              <th className="text-left px-6 py-3 text-xs font-medium text-surface-500 uppercase">Category</th>
              <th className="text-right px-6 py-3 text-xs font-medium text-surface-500 uppercase">Monthly</th>
              <th className="text-right px-6 py-3 text-xs font-medium text-surface-500 uppercase">% of Total</th>
              <th className="text-right px-6 py-3 text-xs font-medium text-surface-500 uppercase">Trend</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center">
                  <p className="text-sm text-surface-500">No expenses recorded yet.</p>
                  <p className="text-xs text-surface-400 mt-1">
                    Add expenses via the API or use the AI companion to build your expense model.
                  </p>
                </td>
              </tr>
            ) : (
              breakdown.map((item) => {
                const change = item.prevAmount > 0
                  ? ((item.amount - item.prevAmount) / item.prevAmount * 100)
                  : 0;
                const trendIcon = change > 1 ? "\u2191" : change < -1 ? "\u2193" : "\u2192";
                const trendColor = change > 1 ? "text-red-600" : change < -1 ? "text-green-600" : "text-surface-500";

                return (
                  <tr key={item.category} className="border-b border-surface-100 hover:bg-surface-50 transition-colors">
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-surface-900">{item.category}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-sm font-semibold text-surface-900">
                        {formatCompactCurrency(item.amount)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-sm text-surface-600">{item.percentage.toFixed(0)}%</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={`text-sm font-medium ${trendColor}`}>
                        {trendIcon} {Math.abs(change).toFixed(0)}%
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* AI suggestion */}
      {breakdown.length > 0 && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
          <div className="flex items-start gap-3">
            <span className="text-lg">AI</span>
            <div>
              <p className="text-sm font-medium text-surface-900">AI Suggestion</p>
              <p className="text-xs text-surface-600 mt-0.5">
                Use the AI companion to analyze your expense trends, identify cost-saving opportunities,
                and model the impact of changes on your runway.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatMonthLabel(monthKey: string): string {
  const parts = monthKey.split("-");
  const year = parts[0] ?? "";
  const month = parts[1] ?? "0";
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[parseInt(month, 10) - 1]} ${year}`;
}
