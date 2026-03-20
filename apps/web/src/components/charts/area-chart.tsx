"use client";

import {
  ResponsiveContainer,
  AreaChart as RechartsAreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { chartColors, chartDefaults, formatMonth, formatCompactCurrency } from "./chart-theme";

interface AreaChartProps {
  data: Array<{ month: string; value: number }>;
  color?: string;
  gradientFrom?: string;
  height?: number;
  formatValue?: (value: number) => string;
  showGrid?: boolean;
}

export function AreaChartWidget({
  data,
  color = chartColors.brand,
  height = 240,
  formatValue = formatCompactCurrency,
  showGrid = true,
}: AreaChartProps) {
  const gradientId = `area-gradient-${color.replace("#", "")}`;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsAreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.15} />
            <stop offset="100%" stopColor={color} stopOpacity={0.01} />
          </linearGradient>
        </defs>
        {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={chartDefaults.gridStroke} vertical={false} />}
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
          width={50}
        />
        <Tooltip
          formatter={(value) => [formatValue(Number(value)), ""]}
          labelFormatter={(label) => formatMonth(String(label))}
          contentStyle={{
            background: chartDefaults.tooltipBg,
            border: `1px solid ${chartDefaults.tooltipBorder}`,
            borderRadius: 8,
            fontSize: chartDefaults.fontSize,
            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.05)",
          }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={chartDefaults.strokeWidth}
          fill={`url(#${gradientId})`}
          dot={false}
          activeDot={{ r: chartDefaults.activeDotRadius, fill: color }}
          animationDuration={chartDefaults.animationDuration}
        />
      </RechartsAreaChart>
    </ResponsiveContainer>
  );
}
