"use client";

import type { BalanceSheet } from "@burnless/engine";
import { StatementTable } from "@/components/reports/statement-table";
import { ExportCSVButton, statementToCSVRows } from "@/components/reports/export-button";
import { BarChartWidget, chartColors, formatCompactCurrency } from "@/components/charts";
import { ChartCard } from "@/components/ui";

export function BalanceSheetView({ balanceSheet }: { balanceSheet: BalanceSheet }) {
  const bs = balanceSheet;

  const barData = bs.assets.values.map((v, i) => ({
    month: v.month,
    assets: v.value,
    liabilities: bs.liabilities.values[i]?.value ?? 0,
    equity: bs.equity.values[i]?.value ?? 0,
  }));

  const sections = [bs.assets, bs.liabilities, bs.equity];
  const { headers, data: csvData } = statementToCSVRows(sections);

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
          <ExportCSVButton data={csvData} headers={headers} filename="balance-sheet" />
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
