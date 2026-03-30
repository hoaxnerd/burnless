"use client";

import { useMemo } from "react";
import type { BudgetVsActuals } from "@burnless/engine";
import { MultiLineChart, VarianceBarChart, chartColors, formatCompactCurrency } from "@/components/charts";
import { ChartCard, SwappableMetricCard } from "@/components/ui";
import { ExportCSVButton } from "@/components/reports/export-button";
import { PageGrid, type DefaultLayoutItem } from "@/components/ui/page-grid";
import { usePageLayout } from "@/components/ui/use-page-layout";
import { PageProvider } from "@/components/providers/page-context";

export function BudgetVsActualsView({ bva }: { bva: BudgetVsActuals }) {
  const { lineItems, totalBudget, totalActual, totalVariance } = bva;

  // Summary metrics
  const totalBudgetSum = totalBudget.reduce((s, v) => s + v.value, 0);
  const totalActualSum = totalActual.reduce((s, v) => s + v.value, 0);
  const totalVarianceSum = totalVariance.reduce((s, v) => s + v.value, 0);

  // Chart data
  const summaryChartData = totalBudget.map((b, i) => ({
    month: b.month,
    budget: b.value,
    actual: totalActual[i]?.value ?? 0,
  }));

  // CSV export
  const headers = ["Account", "Category", ...totalBudget.map((b) => `Budget ${b.month}`), ...totalActual.map((a) => `Actual ${a.month}`)];
  const csvData = lineItems.map((item) => {
    const row: Record<string, unknown> = {
      Account: item.accountName,
      Category: item.category,
    };
    for (const b of item.budget) row[`Budget ${b.month}`] = b.value;
    for (const a of item.actual) row[`Actual ${a.month}`] = a.value;
    return row;
  });

  // ── PageGrid layout ──────────────────────────────────────────────────────
  const pageLayout = usePageLayout({ pageId: "reports/budget-vs-actuals" });

  const defaultLayoutLG: DefaultLayoutItem[] = useMemo(() => [
    { i: "summary-cards", x: 0, w: 12, h: 5, minH: 4 },
    { i: "charts", x: 0, w: 12, h: 12, minH: 8 },
    { i: "detail-table", x: 0, w: 12, h: 16, minH: 8 },
  ], []);

  const defaultLayoutSM: DefaultLayoutItem[] = useMemo(
    () => defaultLayoutLG.map((item) => ({ ...item, x: 0, w: 6 })),
    [defaultLayoutLG]
  );

  const widgets = useMemo(() => ({
    "summary-cards": (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <SwappableMetricCard slug="totalBudget" pageId="reports/bva" label="Total Budget" value={formatCompactCurrency(totalBudgetSum)} />
        <SwappableMetricCard slug="totalActual" pageId="reports/bva" label="Total Actual" value={formatCompactCurrency(totalActualSum)} />
        <SwappableMetricCard
          slug="totalVariance"
          pageId="reports/bva"
          label="Total Variance"
          value={formatCompactCurrency(totalVarianceSum)}
          change={totalVarianceSum >= 0 ? "Favorable" : "Unfavorable"}
        />
      </div>
    ),
    "charts": (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Budget vs Actual" subtitle="Monthly net position">
          <MultiLineChart
            data={summaryChartData}
            lines={[
              { dataKey: "budget", label: "Budget", color: chartColors.brand },
              { dataKey: "actual", label: "Actual", color: chartColors.success, dashed: true },
            ]}
          />
        </ChartCard>
        <ChartCard title="Monthly Variance" subtitle="Actual minus budget">
          <VarianceBarChart data={totalVariance} />
        </ChartCard>
      </div>
    ),
    "detail-table": (
      <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-surface-900">Variance by Account</h2>
          <ExportCSVButton data={csvData} headers={headers} filename="budget-vs-actuals" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200">
                <th scope="col" className="text-left px-3 py-2 text-xs font-medium text-surface-500 uppercase">Account</th>
                <th scope="col" className="text-left px-3 py-2 text-xs font-medium text-surface-500 uppercase">Category</th>
                <th scope="col" className="text-right px-3 py-2 text-xs font-medium text-surface-500 uppercase">Budget (YTD)</th>
                <th scope="col" className="text-right px-3 py-2 text-xs font-medium text-surface-500 uppercase">Actual (YTD)</th>
                <th scope="col" className="text-right px-3 py-2 text-xs font-medium text-surface-500 uppercase">Variance</th>
                <th scope="col" className="text-right px-3 py-2 text-xs font-medium text-surface-500 uppercase">Var %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {lineItems.map((item) => {
                const budgetTotal = item.budget.reduce((s, v) => s + v.value, 0);
                const actualTotal = item.actual.reduce((s, v) => s + v.value, 0);
                const varianceTotal = item.variance.reduce((s, v) => s + v.value, 0);
                const favorableCount = item.favorable.filter((f) => f.value).length;
                const isMostlyFavorable = favorableCount > item.favorable.length / 2;

                return (
                  <tr key={item.accountId} className="hover:bg-surface-50 transition-colors">
                    <td className="px-3 py-2 font-medium text-surface-900">{item.accountName}</td>
                    <td className="px-3 py-2 text-surface-500 capitalize">{item.category.replace("_", " ")}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCompactCurrency(budgetTotal)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCompactCurrency(actualTotal)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-medium ${isMostlyFavorable ? "text-green-600" : "text-red-600"}`}>
                      <span className="sr-only">{isMostlyFavorable ? "Favorable" : "Unfavorable"}:</span>
                      {formatCompactCurrency(varianceTotal)}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${isMostlyFavorable ? "text-green-600" : "text-red-600"}`}>
                      {budgetTotal !== 0 ? `${((varianceTotal / Math.abs(budgetTotal)) * 100).toFixed(1)}%` : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    ),
  }), [totalBudgetSum, totalActualSum, totalVarianceSum, summaryChartData, totalVariance, lineItems, csvData, headers]);

  // Empty state: show before PageGrid
  if (lineItems.length === 0) {
    return (
      <div className="rounded-xl bg-surface-0 border border-surface-200 p-8 text-center">
        <p className="text-sm text-surface-500">
          No budget or actual data to compare. Add forecast lines and import transactions to see variance analysis.
        </p>
      </div>
    );
  }

  return (
    <PageProvider pageId="reports/budget-vs-actuals">
      <PageGrid
        widgets={widgets}
        defaultLayoutLG={defaultLayoutLG}
        defaultLayoutSM={defaultLayoutSM}
        {...pageLayout}
      />
    </PageProvider>
  );
}
