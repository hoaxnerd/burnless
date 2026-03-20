"use client";

import {
  ResponsiveContainer,
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { chartColors, chartDefaults, formatMonth, formatCompactCurrency, tooltipStyle } from "./chart-theme";

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
    <div>
      {/* Inline legend — direct labels per CRED spec */}
      {bars.length > 1 && (
        <div className="flex items-center gap-4 mb-3">
          {bars.map((bar) => (
            <div key={bar.dataKey} className="flex items-center gap-1.5">
              <div
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: bar.color }}
              />
              <span className="text-[11px] font-medium text-surface-500">
                {bar.label}
              </span>
            </div>
          ))}
        </div>
      )}

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
            contentStyle={tooltipStyle}
            cursor={{ fill: "rgba(0,0,0,0.03)", radius: 4 }}
          />
          {bars.map((bar) => (
            <Bar
              key={bar.dataKey}
              dataKey={bar.dataKey}
              fill={bar.color}
              radius={[4, 4, 0, 0]}
              stackId={bar.stackId}
              animationDuration={chartDefaults.animationDuration}
              animationEasing={chartDefaults.animationEasing}
            />
          ))}
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
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
          contentStyle={tooltipStyle}
          cursor={{ fill: "rgba(0,0,0,0.03)", radius: 4 }}
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
