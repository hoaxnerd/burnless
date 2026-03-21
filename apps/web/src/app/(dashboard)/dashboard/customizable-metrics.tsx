"use client";

/**
 * CustomizableMetrics — renders the Key Metrics card with user-customizable
 * metric selection and mode-aware display. Replaces the static MetricRow list.
 */

import { useMemo } from "react";
import { LayoutGrid } from "lucide-react";
import {
  getMetricDef,
  extractMetricValue,
  formatMetricValue,
  evaluateBenchmark,
  DEFAULT_SECONDARY_METRICS,
  type ComputedMetrics,
} from "@burnless/engine";
import { useDashboardIntelligence } from "./dashboard-intelligence-context";

interface CustomizableMetricsProps {
  metrics: ComputedMetrics;
  currentMonth: string;
  prevMonth: string;
  /** Specific overrides for headcount (from headcountSeries, not in ComputedMetrics) */
  headcount?: { current: number; previous: number };
}

export function CustomizableMetrics({
  metrics,
  currentMonth,
  prevMonth,
  headcount,
}: CustomizableMetricsProps) {
  const {
    secondaryMetrics,
    setCatalogOpen,
    mode,
  } = useDashboardIntelligence();

  const activeMetrics = secondaryMetrics.length > 0 ? secondaryMetrics : DEFAULT_SECONDARY_METRICS;

  return (
    <div className="rounded-2xl bg-surface-0 border border-surface-200 p-5 sm:p-6 animate-slide-up stagger-6 hover-lift">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-surface-900">Key Metrics</h2>
        <button
          onClick={() => setCatalogOpen(true)}
          className="flex items-center gap-1 text-xs font-medium text-brand-500 hover:text-brand-600 transition-colors"
        >
          <LayoutGrid className="h-3 w-3" />
          Customize
        </button>
      </div>
      <div className="space-y-1">
        {activeMetrics.map((slug) => (
          <MetricRowDynamic
            key={slug}
            slug={slug}
            metrics={metrics}
            currentMonth={currentMonth}
            prevMonth={prevMonth}
            headcount={headcount}
          />
        ))}
      </div>
    </div>
  );
}

function MetricRowDynamic({
  slug,
  metrics,
  currentMonth,
  prevMonth,
  headcount,
}: {
  slug: string;
  metrics: ComputedMetrics;
  currentMonth: string;
  prevMonth: string;
  headcount?: { current: number; previous: number };
}) {
  const { openFormulaViewer } = useDashboardIntelligence();
  const def = getMetricDef(slug);
  if (!def) return null;

  const currentVal = extractMetricValue(metrics, slug, currentMonth) ?? 0;
  const prevVal = extractMetricValue(metrics, slug, prevMonth) ?? 0;

  const formattedValue = formatMetricValue(currentVal, def.format);

  // Calculate change
  let change: string | null = null;
  if (def.format === "percent") {
    const diff = currentVal - prevVal;
    if (prevVal !== 0 && diff !== 0) {
      change = `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}pp`;
    }
  } else if (def.format === "number") {
    const diff = currentVal - prevVal;
    if (prevVal !== 0 && diff !== 0) {
      change = `${diff >= 0 ? "+" : ""}${diff}`;
    }
  } else if (prevVal !== 0) {
    const pct = ((currentVal - prevVal) / Math.abs(prevVal)) * 100;
    if (pct !== 0) {
      change = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
    }
  }

  const benchmarkSignal = evaluateBenchmark(currentVal, def);

  const benchmarkDisplay = def.benchmark
    ? {
        label: def.benchmark.label,
        status: benchmarkSignal ?? ("good" as const),
      }
    : null;

  return (
    <div
      className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-surface-50 transition-colors -mx-3 group cursor-pointer"
      onClick={() => openFormulaViewer(slug)}
      title={`${def.description} — click to see formula`}
    >
      <span className="text-sm text-surface-500 group-hover:text-surface-700 transition-colors">
        {def.name}
      </span>
      <div className="flex items-center gap-3">
        {change && (
          <span
            className={`text-xs font-medium tabular-nums ${
              def.direction === "lower_better"
                ? change.startsWith("+")
                  ? "text-danger-500"
                  : change.startsWith("-")
                    ? "text-success-500"
                    : "text-surface-400"
                : change.startsWith("+")
                  ? "text-success-500"
                  : change.startsWith("-")
                    ? "text-danger-500"
                    : "text-surface-400"
            }`}
          >
            {change}
          </span>
        )}
        {benchmarkDisplay && (
          <span
            className={`text-xs tabular-nums ${
              benchmarkDisplay.status === "good"
                ? "text-success-500"
                : benchmarkDisplay.status === "warn"
                  ? "text-warning-500"
                  : "text-danger-500"
            }`}
          >
            {benchmarkDisplay.label}
          </span>
        )}
        <span className="text-sm font-semibold text-surface-900 tabular-nums">
          {formattedValue}
        </span>
      </div>
    </div>
  );
}
