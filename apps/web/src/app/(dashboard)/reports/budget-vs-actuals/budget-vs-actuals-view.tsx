"use client";

import { useMemo } from "react";
import { pctOfTotal } from "@burnless/engine";
import { formatPercent } from "@burnless/types";
import type { BudgetVsActuals, ResolvedSlotData } from "@burnless/engine";
import { MultiLineChart, VarianceBarChart, chartColors, formatCompactCurrency } from "@/components/charts";
import { ChartCard, ConnectedPageGrid, SwappableMetricCard, type DefaultLayoutItem } from "@/components/ui";
import { ExportDropdown } from "@/components/reports/export-dropdown";
import { PageLayoutProvider } from "@/components/providers/page-layout-context";
import { ComputedMetricsProvider } from "@/components/providers/computed-metrics-context";
import { PageProvider } from "@/components/providers/page-context";

export function BudgetVsActualsView({ bva, resolvedSlotData }: { bva: BudgetVsActuals; resolvedSlotData: ResolvedSlotData[] }) {
  const { lineItems, totalBudget, totalActual, totalVariance } = bva;

  // Render metric cards directly from resolvedSlotData (keyed by slotId)
  const slotById = useMemo(() => {
    const map = new Map<string, ResolvedSlotData>();
    for (const s of resolvedSlotData) map.set(s.slotId, s);
    return map;
  }, [resolvedSlotData]);

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

  // RPT-10: standardize on the shared ExportDropdown (CSV + PDF).
  const handleExportCSV = () => {
    const csvRows = [headers.join(",")];
    for (const row of csvData) {
      const values = headers.map((h) => {
        const val = row[h];
        if (typeof val === "string" && val.includes(",")) return `"${val}"`;
        return String(val ?? "");
      });
      csvRows.push(values.join(","));
    }
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "budget-vs-actuals.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    const { generateTablePDF, downloadPDF } = await import("@/lib/pdf-export");
    const rows = csvData.map((row) => headers.map((h) => String(row[h] ?? "")));
    const doc = await generateTablePDF(headers, rows, {
      title: "Budget vs Actuals",
      companyName: "Company",
      scenarioName: "Base",
    });
    downloadPDF(doc, "budget-vs-actuals");
  };

  // ── PageGrid layout ──────────────────────────────────────────────────────

  const defaultLayoutLG: DefaultLayoutItem[] = useMemo(() => [
    { i: "metric-0", x: 0, w: 4, h: 5, minW: 2, minH: 4 },
    { i: "metric-1", x: 4, w: 4, h: 5, minW: 2, minH: 4 },
    { i: "metric-2", x: 8, w: 4, h: 5, minW: 2, minH: 4 },
    { i: "budget-actual-chart", x: 0, w: 6, h: 12, minW: 4, minH: 8 },
    { i: "variance-chart",      x: 6, w: 6, h: 12, minW: 4, minH: 8 },
    { i: "detail-table", x: 0, w: 12, h: 16, minH: 8 },
  ], []);

  const defaultLayoutSM: DefaultLayoutItem[] = useMemo(() => [
    { i: "metric-0", x: 0, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "metric-1", x: 3, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "metric-2", x: 0, w: 6, h: 5, minW: 2, minH: 4 },
    { i: "budget-actual-chart", x: 0, w: 6, h: 12, minH: 8 },
    { i: "variance-chart",      x: 0, w: 6, h: 12, minH: 8 },
    { i: "detail-table", x: 0, w: 6, h: 16, minH: 8 },
  ], []);

  const widgets = useMemo(() => ({
    ...Object.fromEntries(
      ["metric-0", "metric-1", "metric-2"].map((slotId, i) => {
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
            stagger={i}
          />,
        ];
      })
    ),
    "budget-actual-chart": (
      <ChartCard title="Budget vs Actual" subtitle="Monthly net position">
        <MultiLineChart
          data={summaryChartData}
          lines={[
            { dataKey: "budget", label: "Budget", color: chartColors.brand },
            { dataKey: "actual", label: "Actual", color: chartColors.success, dashed: true },
          ]}
        />
      </ChartCard>
    ),
    "variance-chart": (
      <ChartCard title="Monthly Variance" subtitle="Actual minus budget">
        <VarianceBarChart data={totalVariance} />
      </ChartCard>
    ),
    "detail-table": (
      <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-surface-900">Variance by Account</h2>
          <ExportDropdown onExportCSV={handleExportCSV} onExportPDF={handleExportPDF} />
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
                      {budgetTotal !== 0 ? formatPercent(pctOfTotal(varianceTotal, Math.abs(budgetTotal))) : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    ),
  }), [slotById, summaryChartData, totalVariance, lineItems, csvData, headers, handleExportCSV, handleExportPDF]);

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
    <PageLayoutProvider pageId="reports/budget-vs-actuals">
      <ComputedMetricsProvider slotData={resolvedSlotData}>
        <PageProvider pageId="reports/budget-vs-actuals">
          <ConnectedPageGrid
            widgets={widgets}
            defaultLayoutLG={defaultLayoutLG}
            defaultLayoutSM={defaultLayoutSM}
          />
        </PageProvider>
      </ComputedMetricsProvider>
    </PageLayoutProvider>
  );
}

