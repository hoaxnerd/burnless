"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { chartColors, chartDefaults, formatMonth, formatCompactCurrency } from "./chart-theme";

interface MultiLineChartProps {
  data: Array<Record<string, unknown>>;
  lines: Array<{
    dataKey: string;
    label: string;
    color?: string;
    dashed?: boolean;
  }>;
  height?: number;
  formatValue?: (value: number) => string;
}

export function MultiLineChart({
  data,
  lines,
  height = 280,
  formatValue = formatCompactCurrency,
}: MultiLineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={chartDefaults.gridStroke} vertical={false} />
        <XAxis
          dataKey="month"
          tickFormatter={formatMonth}
          tick={{ fontSize: chartDefaults.fontSize, fill: chartDefaults.axisStroke }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={formatValue}
          tick={{ fontSize: chartDefaults.fontSize, fill: chartDefaults.axisStroke }}
          axisLine={false}
          tickLine={false}
          width={55}
        />
        <Tooltip
          formatter={(value, name) => {
            const line = lines.find((l) => l.dataKey === name);
            return [formatValue(Number(value)), line?.label ?? String(name)];
          }}
          labelFormatter={(label) => formatMonth(String(label))}
          contentStyle={{
            background: chartDefaults.tooltipBg,
            border: `1px solid ${chartDefaults.tooltipBorder}`,
            borderRadius: 8,
            fontSize: chartDefaults.fontSize,
            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.05)",
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: chartDefaults.fontSize }}
          formatter={(value: string) => {
            const line = lines.find((l) => l.dataKey === value);
            return line?.label ?? value;
          }}
        />
        {lines.map((line, i) => (
          <Line
            key={line.dataKey}
            type="monotone"
            dataKey={line.dataKey}
            stroke={line.color ?? chartColors.palette[i % chartColors.palette.length]}
            strokeWidth={chartDefaults.strokeWidth}
            strokeDasharray={line.dashed ? "6 3" : undefined}
            dot={false}
            activeDot={{ r: chartDefaults.activeDotRadius }}
            animationDuration={chartDefaults.animationDuration}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
