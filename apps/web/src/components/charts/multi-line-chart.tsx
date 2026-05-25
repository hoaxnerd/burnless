"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { chartColors, chartDefaults, formatMonth, formatCompactCurrency } from "./chart-theme";
import { MoMTooltipContent } from "./chart-tooltip";

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
    <div>
      {/* Inline legend — direct labels per CRED spec */}
      <div className="flex items-center gap-4 mb-3">
        {lines.map((line, i) => (
          <div key={line.dataKey} className="flex items-center gap-1.5">
            <div className="relative flex items-center">
              {line.dashed ? (
                <svg width="14" height="3" className="block" aria-hidden="true">
                  <line
                    x1="0"
                    y1="1.5"
                    x2="14"
                    y2="1.5"
                    stroke={line.color ?? chartColors.palette[i % chartColors.palette.length]}
                    strokeWidth="2"
                    strokeDasharray="4 2"
                  />
                </svg>
              ) : (
                <div
                  className="h-2.5 w-2.5 rounded-full"
                  style={{
                    backgroundColor:
                      line.color ?? chartColors.palette[i % chartColors.palette.length],
                  }}
                />
              )}
            </div>
            <span className="text-[11px] font-medium text-surface-500">
              {line.label}
            </span>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={chartDefaults.gridStroke} vertical={false} />
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
            width={55}
          />
          <Tooltip
            content={
              <MoMTooltipContent
                data={data as Array<Record<string, unknown>>}
                entries={lines.map((l, i) => ({
                  dataKey: l.dataKey,
                  label: l.label,
                  color: l.color ?? chartColors.palette[i % chartColors.palette.length]!,
                }))}
                formatValue={formatValue}
              />
            }
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
              activeDot={{ r: chartDefaults.activeDotRadius, strokeWidth: 2, stroke: "#fff" }}
              animationDuration={chartDefaults.animationDuration}
              animationEasing={chartDefaults.animationEasing}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
