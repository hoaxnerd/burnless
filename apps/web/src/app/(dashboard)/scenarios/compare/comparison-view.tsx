"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { Button, Select } from "@/components/ui";
import {
  useScenarioComparison,
  revalidateOnFinancialMutation,
  KEYS,
} from "@/lib/swr";
import { toUserMessage } from "@/lib/api-error";
import { MultiLineChart, VarianceBarChart, chartColors } from "@/components/charts";
import { ScenarioBadge } from "@/components/scenarios/scenario-badge";

import { ratioToPct } from "@burnless/engine";
import { formatPercent, type CurrencyCode } from "@burnless/types";
import type { ScenarioOption, ComparisonData, DataDiffGroup, DataDiffItem } from "./comparison-types";
import { formatCurrency, formatMonth } from "./comparison-types";
import { ComparisonRow } from "./comparison-row";
import { DeltaBadge } from "./comparison-delta-badge";

type Tab = "metrics" | "data";

export function ComparisonView({
  scenarios,
  initialIds,
  currency,
}: {
  scenarios: ScenarioOption[];
  initialIds: string[];
  currency: CurrencyCode;
}) {
  const router = useRouter();
  const [baseId, setBaseId] = useState(initialIds[0] ?? "");
  const [compareId, setCompareId] = useState(initialIds[1] ?? "");
  const [activeTab, setActiveTab] = useState<Tab>("metrics");

  // SCN-07: mirror the selected pair into the URL so refresh/share reproduces it.
  // URL query only — this is unrelated to the active-scenario cookie / X-Scenario-Id
  // single-source contract (apiFetch remains the sole header injector). router.replace
  // (not push) avoids polluting history on every dropdown change.
  useEffect(() => {
    if (baseId && compareId) {
      router.replace(`/scenarios/compare?ids=${baseId},${compareId}`, {
        scroll: false,
      });
    }
  }, [baseId, compareId, router]);

  // SCN-05 / DFL-01: read the comparison (incl. the data-diff change counter)
  // from the shared SWR cache instead of a hand-rolled fetch-in-effect snapshot,
  // so an override edit elsewhere restales the diff without a manual reload.
  // The hook nulls the key (and skips fetching) unless both ids are present and
  // distinct — preserving the original "same scenario → no fetch" guard.
  const canCompare = !!baseId && !!compareId && baseId !== compareId;
  const {
    data,
    error: swrError,
    isLoading,
    mutate: mutateComparison,
  } = useScenarioComparison<ComparisonData>(
    canCompare ? baseId : null,
    canCompare ? compareId : null,
  );

  // Restale the comparison when any scenario-domain mutation fires (an override
  // change on either scenario flips the diff). Preserves the "other" exclusion.
  useEffect(() => {
    return revalidateOnFinancialMutation([
      ...(canCompare ? [KEYS.scenarioComparison(baseId, compareId)] : []),
    ]);
  }, [canCompare, baseId, compareId]);

  const loading = isLoading && canCompare;
  const error = swrError ? toUserMessage(swrError) : null;

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
          <Select
            value={baseId}
            aria-label="Base scenario"
            onChange={(e) => setBaseId(e.target.value)}
          >
            <option value="">Select scenario...</option>
            <option value="base">Base (current plan)</option>
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.source})
              </option>
            ))}
          </Select>
        </div>

        <span className="text-sm font-medium text-surface-400 mb-2">vs</span>

        <div className="flex-1">
          <label className="block text-xs font-medium text-surface-500 mb-1">
            Compare with
          </label>
          <Select
            value={compareId}
            aria-label="Compare with"
            onChange={(e) => setCompareId(e.target.value)}
          >
            <option value="">Select scenario...</option>
            {scenarios
              .filter((s) => s.id !== baseId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.source})
                </option>
              ))}
          </Select>
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
        <div className="rounded-xl bg-red-50 border border-red-200 p-6 flex items-center justify-between gap-4">
          <p className="text-sm text-red-700">{error}</p>
          <Button variant="secondary" size="sm" onClick={() => void mutateComparison()}>
            Retry
          </Button>
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

              {/* Per-metric chart blocks — one outer card per metric, with
                  Trend (MultiLineChart) + Variance (VarianceBarChart) as
                  side-by-side children on lg, stacked on mobile. */}
              <div className="space-y-6">
                {data.lines.map((line) => (
                  <MetricChartBlock
                    key={line.name}
                    line={line}
                    baseName={data.baseScenario.name}
                    compareName={data.compareScenario.name}
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
        </div>
      )}
    </div>
  );
}

/* ── Per-metric chart block ───────────────────────────────────────────── */

/**
 * Outer card per metric containing the Trend (MultiLineChart, base vs compare)
 * and Variance (VarianceBarChart, absolute delta per month) charts side-by-side.
 * Responsive: stacks vertically on mobile, two columns on lg.
 */
function MetricChartBlock({
  line,
  baseName,
  compareName,
}: {
  line: ComparisonData["lines"][number];
  baseName: string;
  compareName: string;
}) {
  const chartData = line.baseValues.map((bv, i) => ({
    month: bv.month,
    [baseName]: bv.value,
    [compareName]: line.compareValues[i]?.value ?? 0,
  }));

  return (
    <div className="rounded-xl bg-surface-0 border border-surface-200 p-4 sm:p-6 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-surface-900">{line.name}</h3>
        <p className="mt-0.5 text-xs text-surface-500">
          {baseName} vs {compareName}
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-surface-100 bg-surface-50/50 p-3 sm:p-4">
          <p className="mb-2 text-xs font-medium text-surface-500">Trend</p>
          <MultiLineChart
            data={chartData}
            lines={[
              { dataKey: baseName, label: baseName, color: chartColors.brand },
              { dataKey: compareName, label: compareName, color: chartColors.warning, dashed: true },
            ]}
          />
        </div>
        <div className="rounded-lg border border-surface-100 bg-surface-50/50 p-3 sm:p-4">
          <p className="mb-2 text-xs font-medium text-surface-500">Variance</p>
          <VarianceBarChart data={line.deltaAbsolute} />
        </div>
      </div>
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
    if (Math.abs(value) < 1 && value !== 0) return formatPercent(ratioToPct(value));
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
