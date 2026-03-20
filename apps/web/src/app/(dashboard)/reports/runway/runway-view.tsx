"use client";

import type { MetricValue } from "@burnless/engine";
import { AreaChartWidget, MultiLineChart, chartColors, formatCompactCurrency } from "@/components/charts";
import { ChartCard, MetricCard } from "@/components/ui";
import { ExportDropdown } from "@/components/reports/export-dropdown";
import { generateRunwaySummaryPDF, downloadPDF } from "@/lib/pdf-export";

interface RunwayViewProps {
  cashPosition: MetricValue[];
  netBurnRate: MetricValue[];
  runway: MetricValue[];
  grossBurnRate: MetricValue[];
  startingCash: number;
  companyName?: string;
  scenarioName?: string;
}

export function RunwayView({ cashPosition, netBurnRate, runway, grossBurnRate, startingCash, companyName, scenarioName }: RunwayViewProps) {
  const latest = cashPosition[cashPosition.length - 1];
  const latestBurn = netBurnRate[netBurnRate.length - 1];
  const latestRunway = runway[runway.length - 1];

  // Find zero-cash month
  const zeroCashMonth = cashPosition.find((c) => c.value <= 0);

  // Prepare data for burn comparison chart
  const burnData = grossBurnRate.map((g, i) => ({
    month: g.month,
    gross: g.value,
    net: netBurnRate[i]?.value ?? 0,
  }));

  const handleExportCSV = () => {
    const headers = ["Month", "Cash Position", "Net Burn Rate", "Gross Burn Rate", "Runway (Months)"];
    const rows = [headers.join(",")];
    for (let i = 0; i < cashPosition.length; i++) {
      rows.push([
        cashPosition[i]!.month,
        String(Math.round(cashPosition[i]!.value)),
        String(Math.round(netBurnRate[i]?.value ?? 0)),
        String(Math.round(grossBurnRate[i]?.value ?? 0)),
        String(Math.round(runway[i]?.value ?? 0)),
      ].join(","));
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "runway-analysis.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    const doc = await generateRunwaySummaryPDF(
      {
        startingCash,
        netBurnRate: latestBurn?.value ?? 0,
        grossBurnRate: grossBurnRate[grossBurnRate.length - 1]?.value ?? 0,
        runwayMonths: latestRunway?.value ?? 0,
        cashPosition,
      },
      {
        title: "Runway Summary",
        companyName: companyName ?? "Company",
        scenarioName: scenarioName ?? "Base",
      }
    );
    downloadPDF(doc, "runway-summary");
  };

  return (
    <div className="space-y-6">
      {/* Summary cards with export */}
      <div className="flex items-center justify-between">
        <div />
        <ExportDropdown onExportCSV={handleExportCSV} onExportPDF={handleExportPDF} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          label="Starting Cash"
          value={formatCompactCurrency(startingCash)}
        />
        <MetricCard
          label="Current Cash"
          value={formatCompactCurrency(latest?.value ?? 0)}
        />
        <MetricCard
          label="Net Burn Rate"
          value={formatCompactCurrency(latestBurn?.value ?? 0)}
          description="Latest month"
        />
        <MetricCard
          label="Runway"
          value={latestRunway && latestRunway.value < 999 ? `${Math.round(latestRunway.value)} months` : "\u221e"}
          description={zeroCashMonth ? `Cash runs out ~${zeroCashMonth.month}` : "Sufficient runway"}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Cash Position Over Time" subtitle="Projected ending cash balance">
          <AreaChartWidget data={cashPosition} color={chartColors.success} />
        </ChartCard>
        <ChartCard title="Runway Projection" subtitle="Months of runway remaining">
          <AreaChartWidget
            data={runway.map((r) => ({ ...r, value: Math.min(r.value, 60) }))}
            color={chartColors.info}
            formatValue={(v) => `${Math.round(v)}mo`}
          />
        </ChartCard>
      </div>

      <ChartCard title="Gross vs Net Burn Rate" subtitle="Monthly expense comparison">
        <MultiLineChart
          data={burnData}
          lines={[
            { dataKey: "gross", label: "Gross Burn", color: chartColors.danger },
            { dataKey: "net", label: "Net Burn", color: chartColors.warning, dashed: true },
          ]}
        />
      </ChartCard>

      {zeroCashMonth && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-800 font-medium">
            Warning: Cash is projected to reach zero in {zeroCashMonth.month}. Consider reducing expenses or raising additional funding.
          </p>
        </div>
      )}
    </div>
  );
}
