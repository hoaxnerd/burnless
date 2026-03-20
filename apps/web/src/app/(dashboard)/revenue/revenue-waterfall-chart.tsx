"use client";

import { BarChartWidget, chartColors } from "@/components/charts";
import { ChartCard } from "@/components/ui";
import type { WaterfallPoint } from "@/lib/compute-revenue";

interface RevenueWaterfallChartProps {
  waterfall: WaterfallPoint[];
}

export function RevenueWaterfallChart({ waterfall }: RevenueWaterfallChartProps) {
  if (waterfall.length === 0) return null;

  // Transform for stacked bar chart: positive bars stacked, churn shown as negative
  const data = waterfall.map((w) => ({
    month: w.month,
    new: w.newMrr,
    expansion: w.expansionMrr,
    churn: -w.churnedMrr, // negative for visual
    net: w.netNewMrr,
  }));

  return (
    <ChartCard
      title="MRR Waterfall"
      subtitle="New + Expansion - Churn = Net New MRR"
    >
      <BarChartWidget
        data={data}
        bars={[
          { dataKey: "new", label: "New MRR", color: chartColors.success, stackId: "mrr" },
          { dataKey: "expansion", label: "Expansion", color: chartColors.brand, stackId: "mrr" },
          { dataKey: "churn", label: "Churned MRR", color: chartColors.danger, stackId: "mrr" },
        ]}
        height={260}
      />
    </ChartCard>
  );
}
