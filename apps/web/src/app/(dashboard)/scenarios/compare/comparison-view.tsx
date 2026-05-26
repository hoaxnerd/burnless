"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api-fetch";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { Button, ChartCard, SwappableMetricCard } from "@/components/ui";
import { MultiLineChart, VarianceBarChart, chartColors } from "@/components/charts";
import { ScenarioBadge } from "@/components/scenarios/scenario-badge";

import type { CurrencyCode } from "@burnless/types";
import type { ScenarioOption, ComparisonData, DataDiffGroup, DataDiffItem } from "./comparison-types";
import { formatCurrency, formatMonth } from "./comparison-types";
import { ComparisonChart } from "./comparison-chart";
import { ComparisonRow } from "./comparison-row";
import { DeltaBadge } from "./comparison-delta-badge";

type Tab = "metrics" | "data" | "charts";

export function ComparisonView({
  scenarios,
  initialIds,
  currency,
}: {
  scenarios: ScenarioOption[];
  initialIds: string[];
  currency: CurrencyCode;
}) {
  const [baseId, setBaseId] = useState(initialIds[0] ?? "");
  const [compareId, setCompareId] = useState(initialIds[1] ?? "");
  const [data, setData] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("metrics");

  const fetchComparison = useCallback(async () => {
    if (!baseId || !compareId || baseId === compareId) {
      setData(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/api/scenarios/compare?baseId=${baseId}&compareId=${compareId}`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to compare scenarios");
      }
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [baseId, compareId]);

  useEffect(() => {
    fetchComparison();
  }, [fetchComparison]);

  if (scenarios.length < 1) {
    return (
      <div className="rounded-xl bg-surface-0 border border-surface-200 p-12 text-center">
        <h3 className="text-lg font-semibold text-surface-900 mb-2">
          Need at least 1 scenario
        </h3>
        <p className="text-sm text-surface-500 mb-6">
          Create a scenario to compare against your base plan.
        </p>
        <Link
          href="/scenarios"
          className="inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
        >
          Back to scenarios
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Scenario selectors */}
      <div className="flex items-end gap-4 mb-8">
        <Link
          href="/scenarios"
          className="flex items-center gap-1 text-sm text-surface-500 hover:text-surface-900 transition-colors mb-1"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>

        <div className="flex-1">
          <label className="block text-xs font-medium text-surface-500 mb-1">
            Base scenario
          </label>
          <select
            value={baseId}
            onChange={(e) => setBaseId(e.target.value)}
            className="w-full rounded-lg border border-surface-200 bg-surface-0 px-3 py-2 text-sm text-surface-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          >
            <option value="">Select scenario...</option>
            <option value="base">Base (current plan)</option>
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.source})
              </option>
            ))}
          </select>
        </div>

        <span className="text-sm font-medium text-surface-400 mb-2">vs</span>

        <div className="flex-1">
          <label className="block text-xs font-medium text-surface-500 mb-1">
            Compare with
          </label>
          <select
            value={compareId}
            onChange={(e) => setCompareId(e.target.value)}
            className="w-full rounded-lg border border-surface-200 bg-surface-0 px-3 py-2 text-sm text-surface-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          >
            <option value="">Select scenario...</option>
            {scenarios
              .filter((s) => s.id !== baseId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.source})
                </option>
              ))}
          </select>
        </div>

        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 rounded-lg border border-surface-200 px-3 py-2 text-xs font-medium text-surface-500 hover:bg-surface-50 hover:text-surface-700 transition-colors mb-1"
          title="Export comparison as PDF"
          data-print-visible
        >
          <Download className="h-3.5 w-3.5" />
          Export PDF
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="rounded-xl bg-surface-0 border border-surface-200 p-12 text-center">
          <p className="text-sm text-surface-500">Loading comparison...</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-6">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* No selection */}
      {!loading && !error && !data && baseId && compareId && baseId === compareId && (
        <div className="rounded-xl bg-surface-0 border border-surface-200 p-12 text-center">
          <p className="text-sm text-surface-500">Select two different scenarios to compare.</p>
        </div>
      )}

      {/* Comparison results */}
      {data && !loading && (
        <div className="space-y-6">
          {/* Tab switcher */}
          <div className="flex gap-2">
            <Button
              variant={activeTab === "metrics" ? "primary" : "secondary"}
              size="sm"
              onClick={() => setActiveTab("metrics")}
            >
              Metric Impact
            </Button>
            <Button
              variant={activeTab === "data" ? "primary" : "secondary"}
              size="sm"
              onClick={() => setActiveTab("data")}
            >
              Data Changes
            </Button>
            <Button
              variant={activeTab === "charts" ? "primary" : "secondary"}
              size="sm"
              onClick={() => setActiveTab("charts")}
            >
              Charts
            </Button>
          </div>

          {/* Metric Impact tab */}
          {activeTab === "metrics" && (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {data.lines.map((line) => {
                  const lastBase = line.baseValues[line.baseValues.length - 1];
                  const lastCompare = line.compareValues[line.compareValues.length - 1];
                  const lastDelta = line.deltaAbsolute[line.deltaAbsolute.length - 1];
                  const lastPct = line.deltaPercent[line.deltaPercent.length - 1];
                  const isCurrency = line.name !== "Headcount";

                  return (
                    <div
                      key={line.name}
                      className="rounded-xl bg-surface-0 border border-surface-200 p-4"
                    >
                      <p className="text-xs font-medium text-surface-500 mb-3">
                        {line.name}
                      </p>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-surface-400">
                            {data.baseScenario.name}
                          </span>
                          <span className="text-sm font-semibold text-surface-900">
                            {isCurrency
                              ? formatCurrency(lastBase?.value ?? 0, currency, undefined, { compact: true })
                              : Math.round(lastBase?.value ?? 0)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-surface-400">
                            {data.compareScenario.name}
                          </span>
                          <span className="text-sm font-semibold text-surface-900">
                            {isCurrency
                              ? formatCurrency(lastCompare?.value ?? 0, currency, undefined, { compact: true })
                              : Math.round(lastCompare?.value ?? 0)}
                          </span>
                        </div>
                        <div className="border-t border-surface-100 pt-2">
                          <DeltaBadge
                            value={lastDelta?.value ?? 0}
                            percent={lastPct?.value ?? 0}
                            isCurrency={isCurrency}
                            positiveIsGood={line.name !== "Expenses"}
                            currency={currency}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Visual trend charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {data.lines.map((line) => (
                  <ComparisonChart
                    key={line.name}
                    line={line}
                    baseName={data.baseScenario.name}
                    compareName={data.compareScenario.name}
                    isCurrency={line.name !== "Headcount"}
                    positiveIsGood={line.name !== "Expenses"}
                    currency={currency}
                  />
                ))}
              </div>

              {/* Monthly detail table */}
              <div className="rounded-xl bg-surface-0 border border-surface-200 overflow-hidden">
                <div className="p-6 border-b border-surface-200">
                  <h2 className="text-lg font-semibold text-surface-900">
                    Monthly Breakdown
                  </h2>
                  <p className="mt-1 text-xs text-surface-500">
                    {data.baseScenario.name} vs {data.compareScenario.name}
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-surface-50">
                        <th scope="col" className="text-left px-4 py-3 text-xs font-medium text-surface-500 sticky left-0 bg-surface-50">
                          Metric
                        </th>
                        <th scope="col" className="text-left px-4 py-3 text-xs font-medium text-surface-500">
                          Scenario
                        </th>
                        {data.lines[0]?.baseValues.map((v) => (
                          <th
                            key={v.month}
                            scope="col"
                            className="text-right px-3 py-3 text-xs font-medium text-surface-500 whitespace-nowrap"
                          >
                            {formatMonth(v.month)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.lines.map((line) => {
                        const isCurrency = line.name !== "Headcount";
                        return (
                          <ComparisonRow
                            key={line.name}
                            line={line}
                            baseName={data.baseScenario.name}
                            compareName={data.compareScenario.name}
                            isCurrency={isCurrency}
                            currency={currency}
                          />
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* Data Changes tab */}
          {activeTab === "data" && (
            <ComparisonDataDiff dataDiff={data.dataDiff} />
          )}

          {/* Charts tab — per-line MultiLineChart + VarianceBarChart + SwappableMetricCard triple */}
          {activeTab === "charts" && (
            <ComparisonChartsTab
              lines={data.lines}
              baseName={data.baseScenario.name}
              compareName={data.compareScenario.name}
              currency={currency}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ── Charts tab ───────────────────────────────────────────────────────── */

function ComparisonChartsTab({
  lines,
  baseName,
  compareName,
  currency,
}: {
  lines: ComparisonData["lines"];
  baseName: string;
  compareName: string;
  currency: CurrencyCode;
}) {
  return (
    <div className="space-y-8">
      {lines.map((line) => {
        const isCurrency = line.name !== "Headcount";
        const chartData = line.baseValues.map((bv, i) => ({
          month: bv.month,
          [baseName]: bv.value,
          [compareName]: line.compareValues[i]?.value ?? 0,
        }));
        const lastBase = line.baseValues[line.baseValues.length - 1]?.value ?? 0;
        const lastCompare = line.compareValues[line.compareValues.length - 1]?.value ?? 0;
        const delta = lastCompare - lastBase;
        const deltaPct = lastBase !== 0
          ? `${delta >= 0 ? "+" : ""}${((delta / Math.abs(lastBase)) * 100).toFixed(1)}%`
          : undefined;
        const fmt = (v: number) =>
          isCurrency
            ? formatCurrency(v, currency, undefined, { compact: true })
            : Math.round(v).toLocaleString();

        return (
          <div key={line.name} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <SwappableMetricCard
                slug={`charts-base-${line.name}`}
                pageId="scenarios/compare"
                label={`${baseName} — ${line.name}`}
                value={fmt(lastBase)}
                metricStyle={{ icon: "BarChart3", color: "blue", href: "#" }}
                stagger={0}
              />
              <SwappableMetricCard
                slug={`charts-compare-${line.name}`}
                pageId="scenarios/compare"
                label={`${compareName} — ${line.name}`}
                value={fmt(lastCompare)}
                metricStyle={{ icon: "BarChart3", color: "amber", href: "#" }}
                stagger={1}
              />
              <SwappableMetricCard
                slug={`charts-delta-${line.name}`}
                pageId="scenarios/compare"
                label={`Delta — ${line.name}`}
                value={fmt(delta)}
                change={deltaPct}
                metricStyle={{ icon: "ArrowUpRight", color: "violet", href: "#" }}
                stagger={2}
              />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ChartCard title={line.name} subtitle={`${baseName} vs ${compareName}`}>
                <MultiLineChart
                  data={chartData}
                  lines={[
                    { dataKey: baseName, label: baseName, color: chartColors.brand },
                    { dataKey: compareName, label: compareName, color: chartColors.warning, dashed: true },
                  ]}
                />
              </ChartCard>
              <ChartCard title={`${line.name} Variance`} subtitle="Absolute delta per month">
                <VarianceBarChart data={line.deltaAbsolute} />
              </ChartCard>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Inline Data Diff Display ──────────────────────────────────────────── */

const entityTypeLabels: Record<string, string> = {
  revenue_stream: "Revenue Streams",
  headcount_plan: "Headcount Plans",
  forecast_line: "Forecast Lines",
  funding_round: "Funding Rounds",
  department: "Departments",
  financial_account: "Financial Accounts",
};

function actionToVariant(action: DataDiffItem["action"]): "modified" | "created" | "deleted" {
  switch (action) {
    case "modify":
      return "modified";
    case "create":
      return "created";
    case "delete":
      return "deleted";
  }
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "\u2014";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    if (Math.abs(value) < 1 && value !== 0) return `${(value * 100).toFixed(1)}%`;
    return value.toLocaleString();
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function getFieldChanges(
  data: Record<string, unknown>,
  originalData: Record<string, unknown>,
): { field: string; from: unknown; to: unknown }[] {
  const changes: { field: string; from: unknown; to: unknown }[] = [];
  const allKeys = new Set([...Object.keys(data), ...Object.keys(originalData)]);

  for (const key of allKeys) {
    if (key === "id" || key === "createdAt" || key === "updatedAt") continue;
    const oldVal = originalData[key];
    const newVal = data[key];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes.push({ field: key, from: oldVal, to: newVal });
    }
  }

  return changes;
}

function getEntityName(item: DataDiffItem): string {
  const data = item.action === "delete" ? item.data : item.data;
  return (
    (data.name as string) ||
    (data.title as string) ||
    (data.label as string) ||
    item.entityId.slice(0, 8)
  );
}

function ComparisonDataDiff({ dataDiff }: { dataDiff?: ComparisonData["dataDiff"] }) {
  if (!dataDiff || dataDiff.summary.total === 0) {
    return (
      <div className="rounded-lg bg-surface-50 border border-surface-200 px-4 py-6 text-center text-sm text-surface-500">
        No data differences between these scenarios.
      </div>
    );
  }

  const { summary, groups } = dataDiff;

  const summaryParts: string[] = [];
  if (summary.modified > 0) summaryParts.push(`${summary.modified} modified`);
  if (summary.created > 0) summaryParts.push(`${summary.created} created`);
  if (summary.deleted > 0) summaryParts.push(`${summary.deleted} deleted`);

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center gap-2 rounded-lg bg-surface-50 border border-surface-200 px-4 py-2.5">
        <span className="text-sm text-surface-600">
          {summaryParts.join(", ")} &mdash;{" "}
          <strong className="text-surface-900">
            {summary.total} total change{summary.total !== 1 ? "s" : ""}
          </strong>
        </span>
      </div>

      {/* Grouped diffs */}
      {groups.map((group) => (
        <DiffGroupDisplay key={group.entityType} group={group} />
      ))}
    </div>
  );
}

function DiffGroupDisplay({ group }: { group: DataDiffGroup }) {
  return (
    <div className="rounded-xl border border-surface-200 overflow-hidden">
      {/* Group header */}
      <div className="bg-surface-50 px-4 py-2.5 border-b border-surface-200">
        <h4 className="text-sm font-semibold text-surface-700">
          {entityTypeLabels[group.entityType] ?? group.entityType}
        </h4>
      </div>

      {/* Diff items */}
      <div className="divide-y divide-surface-100">
        {group.items.map((item) => (
          <DiffItemRow key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

function DiffItemRow({ item }: { item: DataDiffItem }) {
  const variant = actionToVariant(item.action);
  const entityName = getEntityName(item);

  return (
    <div className="px-4 py-3">
      {/* Entity name + badge */}
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-sm font-medium text-surface-900">{entityName}</span>
        <ScenarioBadge variant={variant} />
      </div>

      {/* Field-level changes for modified entities */}
      {item.action === "modify" && item.originalData && (
        <DiffFieldChanges data={item.data} originalData={item.originalData} />
      )}

      {/* New entity note */}
      {item.action === "create" && (
        <p className="text-xs text-surface-500">Present only in the compared scenario</p>
      )}

      {/* Deleted entity note */}
      {item.action === "delete" && (
        <p className="text-xs text-surface-500">Not present in the compared scenario</p>
      )}
    </div>
  );
}

function DiffFieldChanges({
  data,
  originalData,
}: {
  data: Record<string, unknown>;
  originalData: Record<string, unknown>;
}) {
  const changes = getFieldChanges(data, originalData);

  if (changes.length === 0) {
    return <p className="text-xs text-surface-400">No field changes detected</p>;
  }

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {changes.map(({ field, from, to }) => (
        <span key={field} className="text-xs text-surface-600">
          <span className="font-medium text-surface-700">{field}</span>
          {": "}
          <span className="text-danger-600 line-through">{formatValue(from)}</span>
          {" \u2192 "}
          <span className="text-success-700">{formatValue(to)}</span>
        </span>
      ))}
    </div>
  );
}
