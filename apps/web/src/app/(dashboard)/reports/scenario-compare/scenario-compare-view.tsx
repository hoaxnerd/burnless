"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { MultiLineChart, VarianceBarChart, chartColors, formatCompactCurrency } from "@/components/charts";
import { ChartCard, SwappableMetricCard } from "@/components/ui";

interface ScenarioOption {
  id: string;
  name: string;
  type: string;
}

interface ComparisonData {
  baseScenario: string;
  compareScenario: string;
  lines: Array<{
    name: string;
    baseValues: Array<{ month: string; value: number }>;
    compareValues: Array<{ month: string; value: number }>;
    deltaAbsolute: Array<{ month: string; value: number }>;
  }>;
}

export function ScenarioCompareView({
  companyId: _companyId,
  scenarios,
}: {
  companyId: string;
  scenarios: ScenarioOption[];
}) {
  const [baseId, setBaseId] = useState(scenarios[0]!.id);
  const [compareId, setCompareId] = useState(scenarios[1]?.id ?? scenarios[0]!.id);
  const [comparison, setComparison] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (baseId === compareId) {
      setComparison(null); // eslint-disable-line react-hooks/set-state-in-effect -- clear stale data when IDs match
      return;
    }

    setLoading(true);
    apiFetch(`/api/scenarios/compare?baseId=${baseId}&compareId=${compareId}`)
      .then((r) => r.json())
      .then((data) => setComparison(data))
      .catch(() => setComparison(null))
      .finally(() => setLoading(false));
  }, [baseId, compareId]);

  const baseName = scenarios.find((s) => s.id === baseId)?.name ?? "Base";
  const compareName = scenarios.find((s) => s.id === compareId)?.name ?? "Compare";

  return (
    <div className="space-y-6">
      {/* Scenario selectors */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl bg-surface-0 border border-surface-200 p-4">
        <div>
          <label className="text-xs font-medium text-surface-500 block mb-1">Base Scenario</label>
          <select
            value={baseId}
            onChange={(e) => setBaseId(e.target.value)}
            className="rounded-lg border border-surface-200 px-3 py-1.5 text-sm bg-surface-0"
          >
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.type})</option>
            ))}
          </select>
        </div>
        <span className="text-surface-400 text-lg mt-4">vs</span>
        <div>
          <label className="text-xs font-medium text-surface-500 block mb-1">Compare Scenario</label>
          <select
            value={compareId}
            onChange={(e) => setCompareId(e.target.value)}
            className="rounded-lg border border-surface-200 px-3 py-1.5 text-sm bg-surface-0"
          >
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.type})</option>
            ))}
          </select>
        </div>
      </div>

      {baseId === compareId && (
        <p className="text-sm text-surface-500">Select two different scenarios to compare.</p>
      )}

      {loading && (
        <div className="rounded-xl bg-surface-0 border border-surface-200 p-8 text-center">
          <p className="text-sm text-surface-500">Loading comparison...</p>
        </div>
      )}

      {comparison && !loading && (
        <>
          {comparison.lines.map((line) => {
            const chartData = line.baseValues.map((bv, i) => ({
              month: bv.month,
              [baseName]: bv.value,
              [compareName]: line.compareValues[i]?.value ?? 0,
            }));

            const lastBase = line.baseValues[line.baseValues.length - 1]?.value ?? 0;
            const lastCompare = line.compareValues[line.compareValues.length - 1]?.value ?? 0;
            const delta = lastCompare - lastBase;

            return (
              <div key={line.name} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <SwappableMetricCard slug={`base-${line.name}`} pageId="reports/scenario-compare" label={`${baseName} — ${line.name}`} value={formatCompactCurrency(lastBase)} />
                  <SwappableMetricCard slug={`compare-${line.name}`} pageId="reports/scenario-compare" label={`${compareName} — ${line.name}`} value={formatCompactCurrency(lastCompare)} />
                  <SwappableMetricCard
                    slug={`delta-${line.name}`}
                    pageId="reports/scenario-compare"
                    label={`Delta — ${line.name}`}
                    value={formatCompactCurrency(delta)}
                    change={lastBase !== 0 ? `${delta >= 0 ? "+" : ""}${((delta / Math.abs(lastBase)) * 100).toFixed(1)}%` : undefined}
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
        </>
      )}
    </div>
  );
}
