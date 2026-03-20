"use client";

import type { BalanceSheet } from "@burnless/engine";
import { StatementTable } from "@/components/reports/statement-table";
import { statementToCSVRows } from "@/components/reports/export-button";
import { ExportDropdown } from "@/components/reports/export-dropdown";
import { BarChartWidget, chartColors } from "@/components/charts";
import { ChartCard } from "@/components/ui";
import { generateBalanceSheetPDF, downloadPDF } from "@/lib/pdf-export";

export function BalanceSheetView({
  balanceSheet,
  companyName,
  scenarioName,
}: {
  balanceSheet: BalanceSheet;
  companyName?: string;
  scenarioName?: string;
}) {
  const bs = balanceSheet;

  const barData = bs.assets.values.map((v, i) => ({
    month: v.month,
    assets: v.value,
    liabilities: bs.liabilities.values[i]?.value ?? 0,
    equity: bs.equity.values[i]?.value ?? 0,
  }));

  const sections = [bs.assets, bs.liabilities, bs.equity];
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
    link.download = "balance-sheet.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => {
    const doc = generateBalanceSheetPDF(bs, {
      title: "Balance Sheet",
      companyName: companyName ?? "Company",
      scenarioName: scenarioName ?? "Base",
    });
    downloadPDF(doc, "balance-sheet");
  };

  return (
    <div className="space-y-6">
      <ChartCard title="Assets, Liabilities & Equity" subtitle="Monthly snapshot">
        <BarChartWidget
          data={barData}
          bars={[
            { dataKey: "assets", label: "Assets", color: chartColors.brand },
            { dataKey: "liabilities", label: "Liabilities", color: chartColors.danger },
            { dataKey: "equity", label: "Equity", color: chartColors.success },
          ]}
        />
      </ChartCard>

      <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-surface-900">Balance Sheet</h2>
          <ExportDropdown onExportCSV={handleExportCSV} onExportPDF={handleExportPDF} />
        </div>
        <StatementTable
          title="Balance Sheet"
          sections={[
            { item: bs.assets },
            { item: bs.liabilities },
            { item: bs.equity, isSummary: true },
          ]}
        />
      </div>
    </div>
  );
}
