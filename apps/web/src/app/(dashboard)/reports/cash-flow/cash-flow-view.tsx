"use client";

import { useMemo } from "react";
import type { CashFlowStatement } from "@burnless/engine";
import { StatementTable } from "@/components/reports/statement-table";
import { statementToCSVRows } from "@/components/reports/export-button";
import { ExportDropdown } from "@/components/reports/export-dropdown";
import { AreaChartWidget, BarChartWidget, chartColors } from "@/components/charts";
import { ChartCard } from "@/components/ui";
import { PageGrid, type DefaultLayoutItem } from "@/components/ui/page-grid";
import { usePageLayout } from "@/components/ui/use-page-layout";
import { PageProvider } from "@/components/providers/page-context";

export function CashFlowView({
  cashFlow,
  startingCash: _startingCash,
  companyName,
  scenarioName,
}: {
  cashFlow: CashFlowStatement;
  startingCash: number;
  companyName?: string;
  scenarioName?: string;
}) {
  const cf = cashFlow;

  // Bar chart: operating, investing, financing by month
  const barData = cf.operatingCashFlow.values.map((v, i) => ({
    month: v.month,
    operating: v.value,
    investing: cf.investingCashFlow.values[i]?.value ?? 0,
    financing: cf.financingCashFlow.values[i]?.value ?? 0,
  }));

  // Area chart: ending cash
  const cashData = cf.endingCash;

  // CSV
  const sections = [
    cf.operatingCashFlow,
    cf.investingCashFlow,
    cf.financingCashFlow,
    cf.netCashChange,
    { name: "Ending Cash", values: cf.endingCash },
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
    link.download = "cash-flow.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    const { generateCashFlowPDF, downloadPDF } = await import("@/lib/pdf-export");
    const doc = await generateCashFlowPDF(cf, {
      title: "Cash Flow Statement",
      companyName: companyName ?? "Company",
      scenarioName: scenarioName ?? "Base",
    });
    downloadPDF(doc, "cash-flow");
  };

  // ── PageGrid layout ──────────────────────────────────────────────────────
  const pageLayout = usePageLayout({ pageId: "reports/cash-flow" });

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
        <ChartCard title="Cash Flow Components" subtitle="Operating, investing, and financing">
          <BarChartWidget
            data={barData}
            bars={[
              { dataKey: "operating", label: "Operating", color: chartColors.brand, stackId: "cf" },
              { dataKey: "investing", label: "Investing", color: chartColors.warning, stackId: "cf" },
              { dataKey: "financing", label: "Financing", color: chartColors.info, stackId: "cf" },
            ]}
          />
        </ChartCard>
        <ChartCard title="Ending Cash Balance" subtitle="Cumulative cash position">
          <AreaChartWidget data={cashData} color={chartColors.success} />
        </ChartCard>
      </div>
    ),
    "statement": (
      <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-surface-900">Cash Flow Statement</h2>
          <ExportDropdown onExportCSV={handleExportCSV} onExportPDF={handleExportPDF} />
        </div>
        <StatementTable
          title="Cash Flow"
          sections={[
            { item: cf.operatingCashFlow },
            { item: cf.investingCashFlow },
            { item: cf.financingCashFlow },
            { item: cf.netCashChange, isSubtotal: true },
            { item: { name: "Ending Cash", values: cf.endingCash }, isSummary: true },
          ]}
        />
      </div>
    ),
  }), [barData, cashData, cf, handleExportCSV, handleExportPDF]);

  return (
    <PageProvider pageId="reports/cash-flow">
      <PageGrid
        widgets={widgets}
        defaultLayoutLG={defaultLayoutLG}
        defaultLayoutSM={defaultLayoutSM}
        {...pageLayout}
      />
    </PageProvider>
  );
}
