"use client";

import type { CashFlowStatement } from "@burnless/engine";
import { StatementTable } from "@/components/reports/statement-table";
import { ExportCSVButton, statementToCSVRows } from "@/components/reports/export-button";
import { AreaChartWidget, BarChartWidget, chartColors, formatCompactCurrency } from "@/components/charts";
import { ChartCard } from "@/components/ui";

export function CashFlowView({
  cashFlow,
  startingCash,
}: {
  cashFlow: CashFlowStatement;
  startingCash: number;
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

  return (
    <div className="space-y-6">
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

      <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-surface-900">Cash Flow Statement</h2>
          <ExportCSVButton data={csvData} headers={headers} filename="cash-flow" />
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
    </div>
  );
}
