"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api-fetch";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";

import type { ScenarioOption, ComparisonData } from "./comparison-types";
import { formatCurrency, formatMonth } from "./comparison-types";
import { ComparisonChart } from "./comparison-chart";
import { ComparisonRow } from "./comparison-row";
import { DeltaBadge } from "./comparison-delta-badge";

export function ComparisonView({
  scenarios,
  initialIds,
}: {
  scenarios: ScenarioOption[];
  initialIds: string[];
}) {
  const [baseId, setBaseId] = useState(initialIds[0] ?? "");
  const [compareId, setCompareId] = useState(initialIds[1] ?? "");
  const [data, setData] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  if (scenarios.length < 2) {
    return (
      <div className="rounded-xl bg-surface-0 border border-surface-200 p-12 text-center">
        <h3 className="text-lg font-semibold text-surface-900 mb-2">
          Need at least 2 scenarios
        </h3>
        <p className="text-sm text-surface-500 mb-6">
          Create more scenarios to compare different financial projections.
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
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.type})
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
                  {s.name} ({s.type})
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
                          ? formatCurrency(lastBase?.value ?? 0, "USD", undefined, { compact: true })
                          : Math.round(lastBase?.value ?? 0)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-surface-400">
                        {data.compareScenario.name}
                      </span>
                      <span className="text-sm font-semibold text-surface-900">
                        {isCurrency
                          ? formatCurrency(lastCompare?.value ?? 0, "USD", undefined, { compact: true })
                          : Math.round(lastCompare?.value ?? 0)}
                      </span>
                    </div>
                    <div className="border-t border-surface-100 pt-2">
                      <DeltaBadge
                        value={lastDelta?.value ?? 0}
                        percent={lastPct?.value ?? 0}
                        isCurrency={isCurrency}
                        positiveIsGood={line.name !== "Expenses"}
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
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
