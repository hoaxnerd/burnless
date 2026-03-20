"use client";

import { BarChartWidget, chartColors, formatCompactCurrency } from "@/components/charts";
import { ChartCard } from "@/components/ui";
import type { StreamBreakdown } from "@/lib/compute-revenue";

interface RevenueStreamBreakdownProps {
  streams: StreamBreakdown[];
  monthlyByStream: Record<string, unknown>[];
  streamNames: string[];
  totalRevenue: number;
}

const typeLabels: Record<string, string> = {
  subscription: "SaaS",
  one_time: "One-Time",
  usage_based: "Usage",
  services: "Services",
};

const typeColors: Record<string, string> = {
  subscription: "#2563eb",
  one_time: "#10b981",
  usage_based: "#7c3aed",
  services: "#f59e0b",
};

export function RevenueStreamBreakdown({
  streams,
  monthlyByStream,
  streamNames,
  totalRevenue,
}: RevenueStreamBreakdownProps) {
  if (streams.length === 0) return null;

  // Build stacked chart bars (max 6 streams, rest grouped)
  const topStreams = streamNames.slice(0, 6);
  const chartBars = topStreams.map((name, i) => {
    const stream = streams.find((s) => s.name === name);
    const color = stream ? (typeColors[stream.type] ?? chartColors.palette[i % chartColors.palette.length] ?? "#94a3b8") : (chartColors.palette[i % chartColors.palette.length] ?? "#94a3b8");
    return {
      dataKey: name,
      label: name,
      color,
      stackId: "revenue",
    };
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Stacked revenue by stream chart */}
      <div className="lg:col-span-2">
        <ChartCard title="Revenue by Stream" subtitle="Monthly contribution from each revenue source">
          <BarChartWidget data={monthlyByStream} bars={chartBars} height={280} />
        </ChartCard>
      </div>

      {/* Stream proportions */}
      <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
        <h3 className="text-sm font-semibold text-surface-900 mb-4">Revenue Mix</h3>
        <div className="space-y-3">
          {streams.map((stream, i) => {
            const color = typeColors[stream.type] ?? chartColors.palette[i % chartColors.palette.length] ?? "#94a3b8";
            const changeIcon = stream.changePercent > 0.01 ? "\u2191" : stream.changePercent < -0.01 ? "\u2193" : "\u2192";
            const changeColor = stream.changePercent > 0.01 ? "text-green-500" : stream.changePercent < -0.01 ? "text-red-500" : "text-surface-400";

            return (
              <div key={stream.id}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-xs font-medium text-surface-700 truncate">{stream.name}</span>
                    <span className="text-[9px] text-surface-400 flex-shrink-0">{typeLabels[stream.type] ?? stream.type}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs font-semibold tabular-nums text-surface-900">
                      {formatCompactCurrency(stream.currentRevenue)}
                    </span>
                    <span className={`text-[10px] font-medium ${changeColor}`}>
                      {changeIcon}{Math.abs(stream.changePercent * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-surface-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(stream.percentage, 100)}%`,
                      backgroundColor: color,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 pt-3 border-t border-surface-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-surface-500">Total Monthly</span>
            <span className="text-sm font-bold tabular-nums text-surface-900">
              {formatCompactCurrency(totalRevenue)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
