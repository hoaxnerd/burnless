"use client";

/**
 * CustomizableMetrics — renders the Key Metrics card with user-customizable
 * metric selection and mode-aware display. Replaces the static MetricRow list.
 */

import { LayoutGrid } from "lucide-react";
import {
  getMetricDef,
  extractMetricValue,
  formatMetricValue,
  evaluateBenchmark,
  isMetricDataAvailable,
  getMetricMissingDataHint,
  getMetricFallbacks,
  DEFAULT_SECONDARY_METRICS,
  type ComputedMetrics,
} from "@burnless/engine";
import { useMetrics } from "@/components/providers/metrics-context";
import { usePageId } from "@/components/providers/page-context";
import { useDashboardLayout } from "./dashboard-layout-context";
import { CardSettings } from "@/components/ui/card-settings";
import { useAiFlags } from "@/components/ai/ai-feature-context";

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
  const { setCatalogOpen } = useMetrics();
  const { secondaryMetrics } = useDashboardLayout();

  const activeMetrics = secondaryMetrics.length > 0 ? secondaryMetrics : DEFAULT_SECONDARY_METRICS;

  return (
    <div className="h-full flex flex-col rounded-2xl bg-surface-0 border border-surface-200 p-5 sm:p-6 animate-slide-up stagger-6 hover-lift">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-surface-900">Key Metrics</h2>
        <button
          onClick={() => setCatalogOpen(true, "secondary")}
          className="flex items-center gap-1 text-xs font-medium text-brand-500 hover:text-brand-600 transition-colors"
        >
          <LayoutGrid className="h-3 w-3" />
          Customize
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto space-y-1">
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
  headcount: _headcount,
}: {
  slug: string;
  metrics: ComputedMetrics;
  currentMonth: string;
  prevMonth: string;
  headcount?: { current: number; previous: number };
}) {
  const {
    openFormulaViewer, getCardMode: getCardModeRaw, setCardMode: setCardModeRaw, mode: globalMode,
  } = useMetrics();
  const pageId = usePageId() ?? "dashboard";
  const { masterEnabled: aiEnabled } = useAiFlags();
  const def = getMetricDef(slug);
  const cardMode = getCardModeRaw(pageId, slug);
  const isOverride = cardMode !== globalMode;

  if (!def) return null;

  const hasData = isMetricDataAvailable(metrics, slug, currentMonth);

  // If no data available, try to show available dependency metrics as fallback
  if (!hasData) {
    const fallbacks = getMetricFallbacks(slug, metrics, currentMonth);
    const hint = getMetricMissingDataHint(slug);

    if (fallbacks.length > 0) {
      // Show the unavailable parent with its available children inline
      return (
        <div className="py-1 px-3 rounded-xl -mx-3">
          <div className="flex items-center justify-between py-1 opacity-50" title={hint}>
            <span className="text-sm text-surface-400">{def.name}</span>
            <span className="text-xs text-surface-300 italic">{hint}</span>
          </div>
          {fallbacks.map((fb) => (
            <div
              key={fb.slug}
              className="flex items-center justify-between py-1.5 pl-4 cursor-pointer hover:bg-surface-50 rounded-lg transition-colors"
              onClick={() => openFormulaViewer(fb.slug)}
              title={`${fb.def.description} — available as fallback`}
            >
              <span className="text-xs text-surface-400">
                <span className="text-surface-300 mr-1">↳</span>
                {fb.def.name}
              </span>
              <span className="text-xs font-medium text-surface-700 tabular-nums">
                {formatMetricValue(fb.value, fb.def.format)}
              </span>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div
        className="flex items-center justify-between py-2 px-3 rounded-xl -mx-3 opacity-50"
        title={hint}
      >
        <span className="text-sm text-surface-400">{def.name}</span>
        <span className="text-xs text-surface-300 italic">{hint}</span>
      </div>
    );
  }

  const currentVal = extractMetricValue(metrics, slug, currentMonth) ?? 0;
  const prevVal = extractMetricValue(metrics, slug, prevMonth) ?? 0;

  // Skip metrics that resolved to NaN or Infinity
  if (!Number.isFinite(currentVal)) return null;

  const formattedValue = formatMetricValue(currentVal, def.format);

  // Calculate change
  let change: string | null = null;
  if (def.format === "percent") {
    const diff = currentVal - prevVal;
    if (prevVal !== 0 && diff !== 0 && Number.isFinite(diff)) {
      change = `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}pp`;
    }
  } else if (def.format === "number") {
    const diff = currentVal - prevVal;
    if (prevVal !== 0 && diff !== 0 && Number.isFinite(diff)) {
      change = `${diff >= 0 ? "+" : ""}${diff}`;
    }
  } else if (prevVal !== 0) {
    const pct = ((currentVal - prevVal) / Math.abs(prevVal)) * 100;
    if (pct !== 0 && Number.isFinite(pct)) {
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
      <div className="flex items-center gap-2">
        <CardSettings
          currentMode={cardMode}
          onModeChange={(mode) => setCardModeRaw(pageId, slug, mode)}
          isOverride={isOverride}
          aiEnabled={aiEnabled}
        />
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
    </div>
  );
}
