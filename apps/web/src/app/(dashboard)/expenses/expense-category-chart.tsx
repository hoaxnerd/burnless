"use client";

import { ratioToPct } from "@burnless/engine";
import { BarChartWidget, chartColors, formatCompactCurrency } from "@/components/charts";
import { ChartCard } from "@/components/ui";
import { useLocale } from "@/components/locale/locale-context";
import type { SubcategoryBreakdown } from "@/lib/compute-expenses";

interface ExpenseCategoryChartProps {
  breakdown: SubcategoryBreakdown[];
  monthlyBySubcategory: Record<string, unknown>[];
  subcategories: string[];
  totalMonthly: number;
}

// Color palette for subcategories
const SUBCAT_COLORS: Record<string, string> = {
  "People": "#7c3aed",
  "Software & Tools": "#2563eb",
  "Marketing": "#ec4899",
  "Office & Facilities": "#14b8a6",
  "Payment Processing": "#f59e0b",
  "Legal & Compliance": "#6366f1",
  "Travel & Entertainment": "#0ea5e9",
  "Professional Services": "#8b5cf6",
  "Insurance": "#10b981",
  "Cost of Goods Sold": "#f97316",
  "Payroll": "#a855f7",
  "Uncategorized": "#94a3b8",
  "Other": "#94a3b8",
};

function getSubcatColor(subcategory: string, index: number): string {
  return SUBCAT_COLORS[subcategory] ?? chartColors.palette[index % chartColors.palette.length] ?? "#94a3b8";
}

export function ExpenseCategoryChart({
  breakdown,
  monthlyBySubcategory,
  subcategories,
  totalMonthly,
}: ExpenseCategoryChartProps) {
  const { fmtPercent } = useLocale();
  if (breakdown.length === 0) return null;

  // Top subcategories for chart (max 6, rest grouped as "Other")
  const topSubcats = subcategories.slice(0, 6);
  const hasOther = subcategories.length > 6;

  const chartBars = topSubcats.map((subcat, i) => ({
    dataKey: subcat,
    label: subcat,
    color: getSubcatColor(subcat, i),
    stackId: "expenses",
  }));

  if (hasOther) {
    chartBars.push({
      dataKey: "__other",
      label: "Other",
      color: "#94a3b8",
      stackId: "expenses",
    });
  }

  // Aggregate "Other" subcategories in chart data
  const chartData = hasOther
    ? monthlyBySubcategory.map((row) => {
        const newRow: Record<string, unknown> = { month: row.month };
        for (const subcat of topSubcats) {
          newRow[subcat] = row[subcat] ?? 0;
        }
        let otherTotal = 0;
        for (const subcat of subcategories.slice(6)) {
          otherTotal += (row[subcat] as number) ?? 0;
        }
        newRow.__other = otherTotal;
        return newRow;
      })
    : monthlyBySubcategory;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Stacked bar chart */}
      <div className="lg:col-span-2">
        <ChartCard title="Expense Breakdown" subtitle="Monthly spend by category over time">
          <BarChartWidget data={chartData} bars={chartBars} height={280} />
        </ChartCard>
      </div>

      {/* Category proportions */}
      <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
        <h3 className="text-sm font-semibold text-surface-900 mb-4">Category Split</h3>
        <div className="space-y-3">
          {breakdown.map((item, i) => {
            const color = getSubcatColor(item.subcategory, i);
            const changeIcon = item.changePercent > 0.01 ? "\u2191" : item.changePercent < -0.01 ? "\u2193" : "\u2192";
            const changeColor = item.changePercent > 0.01 ? "text-red-500" : item.changePercent < -0.01 ? "text-green-500" : "text-surface-400";

            return (
              <div key={item.subcategory}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-xs font-medium text-surface-700 truncate">{item.subcategory}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold tabular-nums text-surface-900">
                      {formatCompactCurrency(item.amount)}
                    </span>
                    <span className={`text-[10px] font-medium ${changeColor}`}>
                      {changeIcon}{fmtPercent(Math.abs(ratioToPct(item.changePercent)), 0)}
                    </span>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="h-1.5 rounded-full bg-surface-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(item.percentage, 100)}%`,
                      backgroundColor: color,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Total */}
        <div className="mt-4 pt-3 border-t border-surface-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-surface-500">Total Monthly</span>
            <span className="text-sm font-bold tabular-nums text-surface-900">
              {formatCompactCurrency(totalMonthly)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
