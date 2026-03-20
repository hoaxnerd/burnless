"use client";

import { AreaChartWidget, BarChartWidget, MultiLineChart, chartColors, formatCompactCurrency, formatPercent, formatNumber } from "@/components/charts";
import { ChartCard } from "@/components/ui";

interface MetricPoint {
  month: string;
  value: number;
}

interface OverviewChartsProps {
  revenueData: MetricPoint[];
  expensesData: MetricPoint[];
  cashData: MetricPoint[];
  mrrData: MetricPoint[];
  burnRateData: MetricPoint[];
  runwayData: MetricPoint[];
  revenueVsExpenses: Array<{ month: string; revenue: number; expenses: number }>;
  hasSaaS: boolean;
}

export function RevenueChart({ data }: { data: MetricPoint[] }) {
  return (
    <ChartCard title="Revenue" subtitle="Monthly total revenue">
      <AreaChartWidget data={data} color={chartColors.brand} />
    </ChartCard>
  );
}

export function CashPositionChart({ data }: { data: MetricPoint[] }) {
  return (
    <ChartCard title="Cash Position" subtitle="End-of-month cash balance">
      <AreaChartWidget data={data} color={chartColors.success} />
    </ChartCard>
  );
}

export function BurnRunwayChart({ burnData, runwayData }: { burnData: MetricPoint[]; runwayData: MetricPoint[] }) {
  const combined = burnData.map((b, i) => ({
    month: b.month,
    burn: b.value,
    runway: runwayData[i]?.value ?? 0,
  }));

  return (
    <ChartCard title="Burn Rate & Runway" subtitle="Net burn rate and months of runway">
      <MultiLineChart
        data={combined}
        lines={[
          { dataKey: "burn", label: "Net Burn", color: chartColors.danger },
          { dataKey: "runway", label: "Runway (mo)", color: chartColors.info, dashed: true },
        ]}
        formatValue={(v) => (v >= 100 ? formatNumber(v) : formatCompactCurrency(v))}
      />
    </ChartCard>
  );
}

export function RevenueVsExpensesChart({
  data,
}: {
  data: Array<{ month: string; revenue: number; expenses: number }>;
}) {
  return (
    <ChartCard title="Revenue vs Expenses" subtitle="Monthly comparison">
      <BarChartWidget
        data={data}
        bars={[
          { dataKey: "revenue", label: "Revenue", color: chartColors.brand },
          { dataKey: "expenses", label: "Expenses", color: chartColors.danger },
        ]}
      />
    </ChartCard>
  );
}

export function MRRChart({ data }: { data: MetricPoint[] }) {
  return (
    <ChartCard title="MRR" subtitle="Monthly recurring revenue">
      <AreaChartWidget data={data} color="#7c3aed" />
    </ChartCard>
  );
}

export function OverviewCharts({
  revenueData,
  expensesData,
  cashData,
  mrrData,
  burnRateData,
  runwayData,
  revenueVsExpenses,
  hasSaaS,
}: OverviewChartsProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RevenueVsExpensesChart data={revenueVsExpenses} />
        <CashPositionChart data={cashData} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BurnRunwayChart burnData={burnRateData} runwayData={runwayData} />
        {hasSaaS ? <MRRChart data={mrrData} /> : <RevenueChart data={revenueData} />}
      </div>
    </div>
  );
}
