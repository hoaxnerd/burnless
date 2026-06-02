"use client";
import {
  ResponsiveContainer,
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { chartColors, chartDefaults } from "@/components/charts/chart-theme";
import { ChartCard } from "@/components/ui/chart-card";
import { useValueFormatter, type FormatHint } from "./format-hint";

export interface GenBarChartProps {
  title: string;
  format?: FormatHint;
  data: Array<{ label: string; value: number }>;
  bars: Array<{ dataKey: string; label: string; color: string }>;
}

/**
 * Categorical bar chart for genui (expenses-by-category, revenue-by-stream).
 * Keyed on `label` (the existing BarChartWidget is month-keyed and would mangle
 * non-date category labels), but reuses the shared chart theme tokens so colors
 * stay on-palette — never a hardcoded hex outside the theme.
 */
export function GenBarChart({ title, format, data, bars }: GenBarChartProps) {
  const fmt = useValueFormatter(format);
  const bar = bars[0] ?? { dataKey: "value", label: "Amount", color: chartColors.brand };
  return (
    <div className="my-2">
      <ChartCard title={title}>
        <ResponsiveContainer width="100%" height={240}>
          <RechartsBarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={chartDefaults.gridStroke}
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fontSize: chartDefaults.fontSize, fill: chartDefaults.axisStroke }}
              axisLine={false}
              tickLine={false}
              interval={0}
            />
            <YAxis
              tickFormatter={(v) => fmt(Number(v))}
              tick={{ fontSize: chartDefaults.fontSize, fill: chartDefaults.axisStroke }}
              axisLine={false}
              tickLine={false}
              width={50}
            />
            <Tooltip
              formatter={(v) => fmt(Number(v))}
              cursor={{ fill: "rgba(0,0,0,0.03)", radius: 4 }}
            />
            <Bar
              dataKey={bar.dataKey}
              name={bar.label}
              fill={bar.color}
              radius={[4, 4, 0, 0]}
              animationDuration={chartDefaults.animationDuration}
              animationEasing={chartDefaults.animationEasing}
            />
          </RechartsBarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
