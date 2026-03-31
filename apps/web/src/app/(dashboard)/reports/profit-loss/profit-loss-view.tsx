"use client";

import { useMemo, type ReactNode } from "react";
import type { ProfitAndLoss } from "@burnless/engine";
import { StatementTable } from "@/components/reports/statement-table";
import { statementToCSVRows } from "@/components/reports/export-button";
import { ExportDropdown } from "@/components/reports/export-dropdown";
import { MultiLineChart, chartColors, formatPercent } from "@/components/charts";
import { ChartCard } from "@/components/ui";
import { PageGrid, type DefaultLayoutItem } from "@/components/ui/page-grid";
import { PageLayoutProvider, usePageLayoutContext } from "@/components/providers/page-layout-context";
import { PageProvider } from "@/components/providers/page-context";

export function ProfitLossView({
  profitAndLoss,
  companyName,
  scenarioName,
}: {
  profitAndLoss: ProfitAndLoss;
  companyName?: string;
  scenarioName?: string;
}) {
  const pnl = profitAndLoss;

  // Chart data: Revenue, Expenses, Net Income over time
  const chartData = pnl.revenue.values.map((rv, i) => ({
    month: rv.month,
    revenue: rv.value,
    expenses: (pnl.cogs.values[i]?.value ?? 0) + (pnl.operatingExpenses.values[i]?.value ?? 0),
    netIncome: pnl.netIncome.values[i]?.value ?? 0,
  }));

  const marginData = pnl.grossMargin.map((gm, i) => ({
    month: gm.month,
    grossMargin: gm.value,
    netMargin: pnl.netMargin[i]?.value ?? 0,
  }));

  // CSV export
  const sections = [
    pnl.revenue,
    pnl.cogs,
    pnl.grossProfit,
    pnl.operatingExpenses,
    pnl.operatingIncome,
    pnl.otherIncome,
    pnl.otherExpenses,
    pnl.netIncome,
  ];
  const { headers, data: csvData } = statementToCSVRows(sections);

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
    link.download = "profit-and-loss.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    const { generateProfitLossPDF, downloadPDF } = await import("@/lib/pdf-export");
    const doc = await generateProfitLossPDF(pnl, {
      title: "Profit & Loss Statement",
      companyName: companyName ?? "Company",
      scenarioName: scenarioName ?? "Base",
    });
    downloadPDF(doc, "profit-and-loss");
  };

  // ── PageGrid layout ──────────────────────────────────────────────────────

  const defaultLayoutLG: DefaultLayoutItem[] = useMemo(() => [
    { i: "charts", x: 0, w: 12, h: 12, minH: 8 },
    { i: "statement", x: 0, w: 12, h: 16, minH: 8 },
  ], []);

  const defaultLayoutSM: DefaultLayoutItem[] = useMemo(
    () => defaultLayoutLG.map((item) => ({ ...item, x: 0, w: 6 })),
    [defaultLayoutLG]
  );

  const widgets = useMemo(() => ({
    "charts": (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Revenue, Expenses & Net Income" subtitle="Monthly trend">
          <MultiLineChart
            data={chartData}
            lines={[
              { dataKey: "revenue", label: "Revenue", color: chartColors.brand },
              { dataKey: "expenses", label: "Expenses", color: chartColors.danger },
              { dataKey: "netIncome", label: "Net Income", color: chartColors.success },
            ]}
          />
        </ChartCard>
        <ChartCard title="Margins" subtitle="Gross and net margin %">
          <MultiLineChart
            data={marginData}
            lines={[
              { dataKey: "grossMargin", label: "Gross Margin", color: chartColors.brand },
              { dataKey: "netMargin", label: "Net Margin", color: chartColors.success },
            ]}
            formatValue={formatPercent}
          />
        </ChartCard>
      </div>
    ),
    "statement": (
      <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-surface-900">Income Statement</h2>
          <ExportDropdown onExportCSV={handleExportCSV} onExportPDF={handleExportPDF} />
        </div>
        <StatementTable
          title="P&L"
          sections={[
            { item: pnl.revenue },
            { item: pnl.cogs },
            { item: pnl.grossProfit, isSubtotal: true },
            { item: pnl.operatingExpenses },
            { item: pnl.operatingIncome, isSubtotal: true },
            { item: pnl.otherIncome },
            { item: pnl.otherExpenses },
            { item: pnl.netIncome, isSummary: true },
          ]}
        />
      </div>
    ),
  }), [chartData, marginData, pnl, handleExportCSV, handleExportPDF]);

  return (
    <PageLayoutProvider pageId="reports/profit-loss">
      <PageProvider pageId="reports/profit-loss">
        <ProfitLossPageGrid
          widgets={widgets}
          defaultLayoutLG={defaultLayoutLG}
          defaultLayoutSM={defaultLayoutSM}
        />
      </PageProvider>
    </PageLayoutProvider>
  );
}

function ProfitLossPageGrid({
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
