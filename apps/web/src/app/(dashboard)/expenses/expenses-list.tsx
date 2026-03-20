"use client";

import { BarChartWidget, chartColors, formatCompactCurrency } from "@/components/charts";
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
}

export function ExpensesList({
  breakdown,
  timeline,
  opexTimeline,
  cogsTimeline,
  scenarioId,
}: ExpensesListProps) {
  const stackedData = timeline.map((t, i) => ({
    month: t.month,
    opex: opexTimeline[i]?.value ?? 0,
    cogs: cogsTimeline[i]?.value ?? 0,
  }));

  return (
    <div className="space-y-6">
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

      {/* Category Breakdown Table */}
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
            <span className="text-lg">💡</span>
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
