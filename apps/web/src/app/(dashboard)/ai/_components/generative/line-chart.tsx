"use client";
import { MultiLineChart } from "@/components/charts/multi-line-chart";
import { ChartCard } from "@/components/ui/chart-card";
import { useValueFormatter, type FormatHint } from "./format-hint";

export interface GenLineChartProps {
  title: string;
  format?: FormatHint;
  data: Array<{ month: string; value: number }>;
  lines: Array<{ dataKey: string; label: string }>;
}

export function GenLineChart({ title, format, data, lines }: GenLineChartProps) {
  const fmt = useValueFormatter(format);
  return (
    <div className="my-2">
      <ChartCard title={title}>
        <MultiLineChart data={data} lines={lines} formatValue={fmt} />
      </ChartCard>
    </div>
  );
}
