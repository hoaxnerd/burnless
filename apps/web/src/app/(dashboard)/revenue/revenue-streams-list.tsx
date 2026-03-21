"use client";

import { AreaChartWidget, chartColors } from "@/components/charts";
import { ChartCard } from "@/components/ui";

interface MetricPoint {
  month: string;
  value: number;
}

interface StreamData {
  id: string;
  name: string;
  type: string;
  parameters: Record<string, unknown>;
}

interface RevenueStreamsListProps {
  streams: StreamData[];
  revenueTimeline: MetricPoint[];
  mrrTimeline: MetricPoint[];
  hasSaaS: boolean;
  scenarioId: string;
}

const typeLabels: Record<string, string> = {
  subscription: "Subscription",
  one_time: "One-Time",
  usage_based: "Usage-Based",
  services: "Services",
};

const typeColors: Record<string, string> = {
  subscription: "bg-blue-100 text-blue-700",
  one_time: "bg-emerald-100 text-emerald-700",
  usage_based: "bg-purple-100 text-purple-700",
  services: "bg-amber-100 text-amber-700",
};

export function RevenueStreamsList({
  streams,
  revenueTimeline,
  mrrTimeline,
  hasSaaS,
  scenarioId: _scenarioId,
}: RevenueStreamsListProps) {
  return (
    <div className="space-y-6">
      {/* Revenue Over Time Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Revenue Over Time" subtitle="Total monthly revenue">
          <AreaChartWidget data={revenueTimeline} color={chartColors.brand} />
        </ChartCard>
        {hasSaaS && (
          <ChartCard title="MRR Trend" subtitle="Monthly recurring revenue">
            <AreaChartWidget data={mrrTimeline} color="#7c3aed" />
          </ChartCard>
        )}
      </div>

      {/* Revenue Streams Table */}
      <div className="rounded-xl bg-surface-0 border border-surface-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-surface-900">Revenue Streams</h2>
          <span className="text-sm text-surface-500">{streams.length} stream{streams.length !== 1 ? "s" : ""}</span>
        </div>

        {streams.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="text-4xl mb-4">💰</div>
            <h3 className="text-lg font-semibold text-surface-900 mb-2">No revenue streams yet</h3>
            <p className="text-sm text-surface-500 mb-4">
              Model your revenue sources — subscriptions, services, one-time sales, usage-based billing.
            </p>
            <p className="text-xs text-surface-400">
              Use the AI companion or the API: <code className="text-brand-600">POST /api/revenue-streams</code>
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-200 bg-surface-50">
                <th scope="col" className="text-left px-6 py-3 text-xs font-medium text-surface-500 uppercase">Stream</th>
                <th scope="col" className="text-left px-6 py-3 text-xs font-medium text-surface-500 uppercase">Type</th>
                <th scope="col" className="text-right px-6 py-3 text-xs font-medium text-surface-500 uppercase">Parameters</th>
              </tr>
            </thead>
            <tbody>
              {streams.map((stream) => (
                <tr key={stream.id} className="border-b border-surface-100 hover:bg-surface-50 transition-colors">
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium text-surface-900">{stream.name}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${typeColors[stream.type] ?? "bg-surface-100 text-surface-700"}`}>
                      {typeLabels[stream.type] ?? stream.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <StreamParams type={stream.type} params={stream.parameters} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* SaaS Metrics Cards (if applicable) */}
      {hasSaaS && streams.length > 0 && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
          <div className="flex items-start gap-3">
            <span className="text-lg">📊</span>
            <div>
              <p className="text-sm font-medium text-surface-900">SaaS Metrics</p>
              <p className="text-xs text-surface-600 mt-0.5">
                Track your subscription health with MRR, churn, ARPA, LTV, and more.
                Use the AI companion to analyze trends and get recommendations for improving unit economics.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StreamParams({ type, params }: { type: string; params: Record<string, unknown> }) {
  if (type === "subscription") {
    const price = params.monthlyPrice ?? params.price ?? 0;
    const customers = params.startingCustomers ?? params.customers ?? 0;
    const churn = params.monthlyChurnRate ?? params.churn ?? 0;
    return (
      <span className="text-xs text-surface-600">
        ${Number(price)}/mo &middot; {Number(customers)} customers &middot; {(Number(churn) * 100).toFixed(1)}% churn
      </span>
    );
  }
  if (type === "services") {
    const rate = params.hourlyRate ?? params.rate ?? 0;
    const hours = params.monthlyHours ?? params.hours ?? 0;
    return (
      <span className="text-xs text-surface-600">
        ${Number(rate)}/hr &middot; {Number(hours)} hrs/mo
      </span>
    );
  }
  if (type === "one_time") {
    const price = params.unitPrice ?? params.price ?? 0;
    const units = params.monthlyUnits ?? params.units ?? 0;
    return (
      <span className="text-xs text-surface-600">
        ${Number(price)}/unit &middot; {Number(units)} units/mo
      </span>
    );
  }
  return <span className="text-xs text-surface-400">—</span>;
}
