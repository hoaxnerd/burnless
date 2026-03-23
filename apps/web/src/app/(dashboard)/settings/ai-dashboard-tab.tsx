"use client";

import { useState, useEffect } from "react";
import {
  Activity,
  BarChart3,
  Clock,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Zap,
  ArrowUpRight,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface FeatureBreakdownRow {
  feature: string;
  tier: string;
  provider: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostMicros: number;
  requestCount: number;
  avgDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  maxDurationMs: number;
  costUSD: number;
  percentOfTotal: number;
}

interface DailySpend {
  date: string;
  totalCostMicros: number;
  requestCount: number;
  avgDurationMs: number;
  costUSD: number;
}

interface ProviderHealth {
  provider: string;
  circuit: { state: string; failureCount: number; successCount: number };
  rateLimit: { remaining: number; maxRequests: number; windowMs: number };
}

interface BudgetStatus {
  spentCents: number;
  budgetCents: number;
  percentUsed: number;
  warning: boolean;
  exceeded: boolean;
}

interface DashboardData {
  period: { days: number; since: string };
  summary: { totalCostMicros: number; totalCostUSD: number; totalRequests: number };
  budget: BudgetStatus;
  featureBreakdown: FeatureBreakdownRow[];
  dailySpend: DailySpend[];
  providerHealth: ProviderHealth[];
  routing: {
    featureTiers: Record<string, string>;
    featureProviders: Record<string, string>;
  };
}

// ── Main Component ───────────────────────────────────────────────────────────

export function AiDashboardTab() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setLoading(true);
    fetch(`/api/ai-dashboard?days=${days}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [days]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl bg-surface-0 border border-surface-200 p-8 text-center">
        <p className="text-sm text-surface-500">Failed to load dashboard data</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Period Selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-surface-900">AI Observability</h2>
        <div className="flex gap-1 bg-surface-100 rounded-lg p-0.5">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                days === d
                  ? "bg-white text-surface-900 shadow-sm"
                  : "text-surface-500 hover:text-surface-700"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard
          icon={<DollarSign className="h-4 w-4" />}
          label="Total Cost"
          value={`$${data.summary.totalCostUSD.toFixed(2)}`}
          color="brand"
        />
        <SummaryCard
          icon={<Activity className="h-4 w-4" />}
          label="Requests"
          value={data.summary.totalRequests.toLocaleString()}
          color="blue"
        />
        <SummaryCard
          icon={<Zap className="h-4 w-4" />}
          label="Budget Used"
          value={`${data.budget.percentUsed.toFixed(1)}%`}
          color={data.budget.exceeded ? "red" : data.budget.warning ? "amber" : "green"}
        />
        <SummaryCard
          icon={<Clock className="h-4 w-4" />}
          label="Avg Latency"
          value={
            data.featureBreakdown.length > 0
              ? `${Math.round(
                  data.featureBreakdown.reduce((s, f) => s + (f.avgDurationMs ?? 0) * f.requestCount, 0) /
                    Math.max(data.summary.totalRequests, 1)
                )}ms`
              : "N/A"
          }
          color="purple"
        />
      </div>

      {/* Budget Bar */}
      <div className="rounded-2xl bg-surface-0 border border-surface-200 p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-surface-900">Monthly Budget</h3>
          <span className="text-xs text-surface-500">
            ${(data.budget.spentCents / 100).toFixed(2)} / ${(data.budget.budgetCents / 100).toFixed(2)}
          </span>
        </div>
        <div className="h-3 bg-surface-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              data.budget.exceeded
                ? "bg-red-500"
                : data.budget.warning
                  ? "bg-amber-500"
                  : "bg-brand-500"
            }`}
            style={{ width: `${Math.min(data.budget.percentUsed, 100)}%` }}
          />
        </div>
      </div>

      {/* Daily Spend Mini-Chart */}
      {data.dailySpend.length > 0 && (
        <div className="rounded-2xl bg-surface-0 border border-surface-200 p-6">
          <h3 className="text-sm font-semibold text-surface-900 mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-surface-400" />
            Daily Spend
          </h3>
          <DailySpendChart data={data.dailySpend} />
        </div>
      )}

      {/* Feature Breakdown Table */}
      {data.featureBreakdown.length > 0 && (
        <div className="rounded-2xl bg-surface-0 border border-surface-200 p-6 overflow-x-auto">
          <h3 className="text-sm font-semibold text-surface-900 mb-4">Cost & Performance by Feature</h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-surface-500 border-b border-surface-100">
                <th className="text-left py-2 pr-4 font-medium">Feature</th>
                <th className="text-left py-2 pr-4 font-medium">Tier</th>
                <th className="text-left py-2 pr-4 font-medium">Provider</th>
                <th className="text-right py-2 pr-4 font-medium">Requests</th>
                <th className="text-right py-2 pr-4 font-medium">Cost</th>
                <th className="text-right py-2 pr-4 font-medium">P50</th>
                <th className="text-right py-2 pr-4 font-medium">P95</th>
                <th className="text-right py-2 font-medium">% Total</th>
              </tr>
            </thead>
            <tbody>
              {data.featureBreakdown
                .sort((a, b) => b.totalCostMicros - a.totalCostMicros)
                .map((f, i) => (
                  <tr key={i} className="border-b border-surface-50 last:border-0">
                    <td className="py-2.5 pr-4 font-mono text-surface-900">{f.feature}</td>
                    <td className="py-2.5 pr-4">
                      <TierBadge tier={f.tier} />
                    </td>
                    <td className="py-2.5 pr-4 text-surface-600">{f.provider}</td>
                    <td className="py-2.5 pr-4 text-right text-surface-700 tabular-nums">
                      {f.requestCount.toLocaleString()}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-surface-900 font-medium tabular-nums">
                      ${f.costUSD.toFixed(4)}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-surface-600 tabular-nums">
                      {f.p50DurationMs ? `${f.p50DurationMs}ms` : "-"}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-surface-600 tabular-nums">
                      {f.p95DurationMs ? `${f.p95DurationMs}ms` : "-"}
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <div className="w-12 h-1.5 bg-surface-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-brand-400 rounded-full"
                            style={{ width: `${f.percentOfTotal}%` }}
                          />
                        </div>
                        <span className="text-surface-500 tabular-nums w-10 text-right">
                          {f.percentOfTotal.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Provider Health */}
      <div className="rounded-2xl bg-surface-0 border border-surface-200 p-6">
        <h3 className="text-sm font-semibold text-surface-900 mb-4">Provider Health</h3>
        {data.providerHealth.length === 0 ? (
          <p className="text-xs text-surface-500">No providers initialized yet. Health data appears after the first AI request.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {data.providerHealth.map((p) => (
              <ProviderHealthCard key={p.provider} health={p} />
            ))}
          </div>
        )}
      </div>

      {/* Routing Config */}
      <div className="rounded-2xl bg-surface-0 border border-surface-200 p-6">
        <h3 className="text-sm font-semibold text-surface-900 mb-4 flex items-center gap-2">
          <ArrowUpRight className="h-4 w-4 text-surface-400" />
          Feature Routing
        </h3>
        <div className="grid gap-2">
          {Object.entries(data.routing.featureTiers).map(([feature, tier]) => (
            <div key={feature} className="flex items-center justify-between py-1.5 text-xs">
              <span className="font-mono text-surface-900">{feature}</span>
              <div className="flex items-center gap-2">
                <TierBadge tier={tier} />
                {data.routing.featureProviders[feature] && (
                  <span className="text-surface-500">
                    via {data.routing.featureProviders[feature]}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function SummaryCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    brand: "bg-brand-50 text-brand-600",
    blue: "bg-blue-50 text-blue-600",
    green: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
    purple: "bg-purple-50 text-purple-600",
  };

  return (
    <div className="rounded-xl bg-surface-0 border border-surface-200 p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`h-6 w-6 rounded-md flex items-center justify-center ${colorMap[color] ?? colorMap.brand}`}>
          {icon}
        </div>
        <span className="text-xs text-surface-500">{label}</span>
      </div>
      <p className="text-lg font-semibold text-surface-900 tabular-nums">{value}</p>
    </div>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    fast: "bg-emerald-50 text-emerald-700 border-emerald-200",
    standard: "bg-blue-50 text-blue-700 border-blue-200",
    deep: "bg-purple-50 text-purple-700 border-purple-200",
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${colors[tier] ?? "bg-surface-50 text-surface-600 border-surface-200"}`}>
      {tier}
    </span>
  );
}

function ProviderHealthCard({ health }: { health: ProviderHealth }) {
  const stateIcon =
    health.circuit.state === "closed" ? (
      <CheckCircle className="h-4 w-4 text-emerald-500" />
    ) : health.circuit.state === "open" ? (
      <XCircle className="h-4 w-4 text-red-500" />
    ) : (
      <AlertTriangle className="h-4 w-4 text-amber-500" />
    );

  const stateLabel =
    health.circuit.state === "closed"
      ? "Healthy"
      : health.circuit.state === "open"
        ? "Circuit Open"
        : "Half Open";

  const rateLimitPercent =
    ((health.rateLimit.maxRequests - health.rateLimit.remaining) /
      health.rateLimit.maxRequests) *
    100;

  return (
    <div className="rounded-xl border border-surface-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-surface-900 capitalize">{health.provider}</span>
        <div className="flex items-center gap-1.5">
          {stateIcon}
          <span className="text-xs text-surface-600">{stateLabel}</span>
        </div>
      </div>
      <div className="space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-surface-500">Failures</span>
          <span className="text-surface-700 tabular-nums">{health.circuit.failureCount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-surface-500">Rate Limit</span>
          <span className="text-surface-700 tabular-nums">
            {health.rateLimit.remaining}/{health.rateLimit.maxRequests}
          </span>
        </div>
        <div className="h-1.5 bg-surface-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              rateLimitPercent > 80 ? "bg-amber-400" : "bg-surface-300"
            }`}
            style={{ width: `${rateLimitPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function DailySpendChart({ data }: { data: DailySpend[] }) {
  const maxCost = Math.max(...data.map((d) => d.costUSD), 0.001);

  return (
    <div className="flex items-end gap-[2px] h-20">
      {data.map((d, i) => {
        const height = (d.costUSD / maxCost) * 100;
        return (
          <div
            key={i}
            className="group relative flex-1 min-w-[3px]"
          >
            <div
              className="w-full bg-brand-400 hover:bg-brand-500 rounded-t transition-colors cursor-pointer"
              style={{ height: `${Math.max(height, 2)}%` }}
            />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10">
              <div className="bg-surface-900 text-white text-[10px] px-2 py-1 rounded shadow-lg whitespace-nowrap">
                <div>${d.costUSD.toFixed(4)}</div>
                <div className="text-surface-400">{d.requestCount} reqs</div>
                <div className="text-surface-400">{d.date}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
