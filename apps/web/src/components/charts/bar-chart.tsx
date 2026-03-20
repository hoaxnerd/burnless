"use client";

import {
  ResponsiveContainer,
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from "recharts";
import { chartColors, chartDefaults, formatMonth, formatCompactCurrency } from "./chart-theme";

interface BarChartProps {
  data: Array<Record<string, unknown>>;
  bars: Array<{
    dataKey: string;
    label: string;
    color: string;
    stackId?: string;
  }>;
  height?: number;
  formatValue?: (value: number) => string;
}

export function BarChartWidget({
  data,
  bars,
  height = 240,
  formatValue = formatCompactCurrency,
}: BarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsBarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
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
          width={50}
        />
        <Tooltip
          formatter={(value, name) => {
            const bar = bars.find((b) => b.dataKey === name);
            return [formatValue(Number(value)), bar?.label ?? String(name)];
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
        {bars.length > 1 && (
          <Legend
            wrapperStyle={{ fontSize: chartDefaults.fontSize }}
            formatter={(value: string) => {
              const bar = bars.find((b) => b.dataKey === value);
              return bar?.label ?? value;
            }}
          />
        )}
        {bars.map((bar) => (
          <Bar
            key={bar.dataKey}
            dataKey={bar.dataKey}
            fill={bar.color}
            radius={[4, 4, 0, 0]}
            stackId={bar.stackId}
            animationDuration={chartDefaults.animationDuration}
          />
        ))}
      </RechartsBarChart>
    </ResponsiveContainer>
  );
}

/** Simplified variance bar chart - green positive, red negative */
interface VarianceBarChartProps {
  data: Array<{ month: string; value: number }>;
  height?: number;
  formatValue?: (value: number) => string;
}

export function VarianceBarChart({
  data,
  height = 200,
  formatValue = formatCompactCurrency,
}: VarianceBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsBarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
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
          width={50}
        />
        <Tooltip
          formatter={(value) => [formatValue(Number(value)), "Variance"]}
          labelFormatter={(label) => formatMonth(String(label))}
          contentStyle={{
            background: chartDefaults.tooltipBg,
            border: `1px solid ${chartDefaults.tooltipBorder}`,
            borderRadius: 8,
            fontSize: chartDefaults.fontSize,
          }}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} animationDuration={chartDefaults.animationDuration}>
          {data.map((entry, index) => (
            <Cell key={index} fill={entry.value >= 0 ? chartColors.success : chartColors.danger} />
          ))}
        </Bar>
      </RechartsBarChart>
    </ResponsiveContainer>
  );
}
