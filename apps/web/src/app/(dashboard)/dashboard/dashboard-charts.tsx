"use client";

import {
  AreaChartWidget,
  BarChartWidget,
  MultiLineChart,
  chartColors,
  formatCompactCurrency,
} from "@/components/charts";

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

function DashboardChartCard({
  title,
  subtitle,
  children,
  stagger = 0,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  stagger?: number;
}) {
  return (
    <div
      className={`
        rounded-2xl bg-surface-0 border border-surface-200
        p-5 sm:p-6
        hover:border-surface-300 hover:shadow-md
        transition-all duration-300
        animate-slide-up stagger-${stagger}
      `}
    >
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-surface-900">{title}</h3>
        <p className="mt-0.5 text-xs text-surface-400">{subtitle}</p>
      </div>
      {children}
    </div>
  );
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
    <div className="space-y-6 sm:space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <DashboardChartCard
          title="Cash Position"
          subtitle="Cash balance over time"
          stagger={1}
        >
          <AreaChartWidget data={cashData} color={chartColors.success} />
        </DashboardChartCard>

        <DashboardChartCard
          title="Revenue vs Expenses"
          subtitle="Monthly comparison"
          stagger={2}
        >
          <BarChartWidget
            data={revenueVsExpenses}
            bars={[
              { dataKey: "revenue", label: "Revenue", color: chartColors.brand },
              { dataKey: "expenses", label: "Expenses", color: chartColors.danger },
            ]}
          />
        </DashboardChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <DashboardChartCard
          title="Burn Rate & Runway"
          subtitle="Net burn and months of runway"
          stagger={3}
        >
          <MultiLineChart
            data={burnRunwayCombined}
            lines={[
              { dataKey: "burn", label: "Net Burn", color: chartColors.danger },
              { dataKey: "runway", label: "Runway (mo)", color: chartColors.info, dashed: true },
            ]}
            formatValue={formatCompactCurrency}
          />
        </DashboardChartCard>

        {hasSaaS ? (
          <DashboardChartCard
            title="MRR"
            subtitle="Monthly recurring revenue"
            stagger={4}
          >
            <AreaChartWidget data={mrrData} color="#7c3aed" />
          </DashboardChartCard>
        ) : (
          <DashboardChartCard
            title="Revenue Trend"
            subtitle="Total monthly revenue"
            stagger={4}
          >
            <AreaChartWidget data={cashData} color={chartColors.brand} />
          </DashboardChartCard>
        )}
      </div>
    </div>
  );
}
