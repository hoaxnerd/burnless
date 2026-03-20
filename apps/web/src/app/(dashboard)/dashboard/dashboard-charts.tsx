"use client";

import {
  AreaChartWidget,
  BarChartWidget,
  MultiLineChart,
  chartColors,
  formatCompactCurrency,
} from "@/components/charts";
import { ChartCard } from "@/components/ui";

interface MetricPoint {
  month: string;
  value: number;
}

interface DashboardChartsProps {
  revenueVsExpenses: Array<{ month: string; revenue: number; expenses: number }>;
  cashData: MetricPoint[];
  burnData: MetricPoint[];
  runwayData: MetricPoint[];
  mrrData: MetricPoint[];
  hasSaaS: boolean;
}

export function DashboardCharts({
  revenueVsExpenses,
  cashData,
  burnData,
  runwayData,
  mrrData,
  hasSaaS,
}: DashboardChartsProps) {
  const burnRunwayCombined = burnData.map((b, i) => ({
    month: b.month,
    burn: b.value,
    runway: runwayData[i]?.value ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cash Runway Chart (actual + projected) */}
        <ChartCard title="Cash Runway" subtitle="Cash position over time">
          <AreaChartWidget data={cashData} color={chartColors.success} />
        </ChartCard>

        {/* Revenue vs Expenses */}
        <ChartCard title="Revenue vs Expenses" subtitle="Monthly comparison">
          <BarChartWidget
            data={revenueVsExpenses}
            bars={[
              { dataKey: "revenue", label: "Revenue", color: chartColors.brand },
              { dataKey: "expenses", label: "Expenses", color: chartColors.danger },
            ]}
          />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Burn Rate & Runway */}
        <ChartCard title="Burn Rate & Runway" subtitle="Net burn and months of runway">
          <MultiLineChart
            data={burnRunwayCombined}
            lines={[
              { dataKey: "burn", label: "Net Burn", color: chartColors.danger },
              { dataKey: "runway", label: "Runway (mo)", color: chartColors.info, dashed: true },
            ]}
            formatValue={formatCompactCurrency}
          />
        </ChartCard>

        {/* MRR or Revenue trend */}
        {hasSaaS ? (
          <ChartCard title="MRR" subtitle="Monthly recurring revenue">
            <AreaChartWidget data={mrrData} color="#7c3aed" />
          </ChartCard>
        ) : (
          <ChartCard title="Revenue Trend" subtitle="Total monthly revenue">
            <AreaChartWidget data={cashData} color={chartColors.brand} />
          </ChartCard>
        )}
      </div>
    </div>
  );
}
