"use client";
import { AreaChartWidget } from "@/components/charts/area-chart";
import { ChartCard } from "@/components/ui/chart-card";
import { useValueFormatter, type FormatHint } from "./format-hint";

export interface GenAreaChartProps {
  title: string;
  format?: FormatHint;
  data: Array<{ month: string; value: number }>;
  color?: string;
}

export function GenAreaChart({ title, format, data, color }: GenAreaChartProps) {
  const fmt = useValueFormatter(format);
  return (
    <div className="my-2">
      <ChartCard title={title}>
        <AreaChartWidget data={data} color={color} formatValue={fmt} />
      </ChartCard>
    </div>
  );
}
