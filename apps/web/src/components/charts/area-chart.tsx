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
import { chartDefaults, formatMonth, formatCompactCurrency } from "./chart-theme";
import { SingleMoMTooltip } from "./chart-tooltip";

interface AreaChartProps {
  data: Array<{ month: string; value: number }>;
  color?: string;
  height?: number;
  formatValue?: (value: number) => string;
  showGrid?: boolean;
  /** Show the latest value as a direct label on the chart */
  showLatestLabel?: boolean;
}

export function AreaChartWidget({
  data,
  color = "#2563eb",
  height = 240,
  formatValue = formatCompactCurrency,
  showGrid = true,
  showLatestLabel = false,
}: AreaChartProps) {
  const gradientId = `area-gradient-${color.replace("#", "")}`;
  const latestValue = data.length > 0 ? data[data.length - 1]!.value : null;

  return (
    <div className="relative">
      {/* Direct label — latest value shown on chart */}
      {showLatestLabel && latestValue !== null && (
        <div className="absolute top-0 right-0 z-10">
          <span
            className="text-xs font-bold tabular-nums"
            style={{ color }}
          >
            {formatValue(latestValue)}
          </span>
        </div>
      )}

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
            tickFormatter={(v) => formatMonth(String(v))}
            tick={{ fontSize: chartDefaults.fontSize, fill: chartDefaults.axisStroke }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => formatValue(v)} // [Phase 4 E Task 7] wrap to drop Recharts' implicit index arg
            tick={{ fontSize: chartDefaults.fontSize, fill: chartDefaults.axisStroke }}
            axisLine={false}
            tickLine={false}
            width={50}
          />
          <Tooltip
            content={
              <SingleMoMTooltip
                data={data}
                color={color}
                formatValue={formatValue}
              />
            }
            cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: "4 4" }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={chartDefaults.strokeWidth}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: chartDefaults.activeDotRadius, fill: color, strokeWidth: 2, stroke: "#fff" }}
            animationDuration={chartDefaults.animationDuration}
            animationEasing={chartDefaults.animationEasing}
          />
        </RechartsAreaChart>
      </ResponsiveContainer>
    </div>
  );
}
