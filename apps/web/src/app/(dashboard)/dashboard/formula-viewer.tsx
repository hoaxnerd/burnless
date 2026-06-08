"use client";

/**
 * Formula Dependency Viewer — shows a metric's formula, its dependency tree,
 * and what metrics depend on it, in a visual card/tree layout.
 */

import { useMemo } from "react";
import { Overlay, IconButton } from "@/components/ui";
import { X, ArrowDown, ArrowUp, Info } from "lucide-react";
import {
  getMetricDef,
  getMetricDependencyTree,
  getMetricDependents,
  CATEGORY_META,
  type MetricDefinition,
  type MetricTier,
} from "@burnless/engine";
import { useMetrics } from "@/components/providers/metrics-context";

const tierColors: Record<MetricTier, string> = {
  core: "border-brand-500/30 bg-brand-500/5",
  advanced: "border-violet-500/30 bg-violet-500/5",
  deep: "border-surface-300 bg-surface-50",
};

export function FormulaViewer() {
  const { formulaViewerSlug, closeFormulaViewer } = useMetrics();

  const metric = formulaViewerSlug ? getMetricDef(formulaViewerSlug) : null;

  const deps = useMemo(() => {
    if (!formulaViewerSlug) return [];
    return getMetricDependencyTree(formulaViewerSlug)
      .map((slug) => getMetricDef(slug))
      .filter((d): d is MetricDefinition => !!d);
  }, [formulaViewerSlug]);

  const dependents = useMemo(() => {
    if (!formulaViewerSlug) return [];
    return getMetricDependents(formulaViewerSlug)
      .map((slug) => getMetricDef(slug))
      .filter((d): d is MetricDefinition => !!d);
  }, [formulaViewerSlug]);

  // Direct dependencies (first level only)
  const directDeps = useMemo(() => {
    if (!metric) return [];
    return metric.dependsOn
      .map((slug) => getMetricDef(slug))
      .filter((d): d is MetricDefinition => !!d);
  }, [metric]);

  const open = Boolean(metric && formulaViewerSlug);

  return (
    <Overlay
      open={open}
      onClose={closeFormulaViewer}
      headless
      className="!p-0"
      scrimClassName="bg-black/30 fixed inset-0 backdrop-blur-sm z-[60] transition-opacity"
    >
      {(panelProps) =>
        metric ? (
        <div
          {...panelProps}
          role="dialog"
          aria-modal="true"
          aria-label={metric.name}
          className="fixed inset-4 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-2xl sm:max-h-[80vh] bg-surface-0 rounded-2xl border border-surface-200 shadow-2xl z-[60] flex flex-col overflow-hidden outline-none"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200">
          <div>
            <h2 className="text-lg font-bold text-surface-900">{metric.name}</h2>
            <p className="text-xs text-surface-400 mt-0.5">
              {CATEGORY_META[metric.category]?.label} metric
            </p>
          </div>
          <IconButton
            aria-label="Close"
            onClick={closeFormulaViewer}
            icon={<X className="text-surface-500" />}
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Description */}
          <p className="text-sm text-surface-600">{metric.description}</p>

          {/* Formula */}
          <div className="rounded-xl bg-surface-50 border border-surface-200 p-4">
            <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">
              Formula
            </h3>
            <code className="text-sm text-surface-900 font-mono block leading-relaxed">
              {metric.formula}
            </code>
          </div>

          {/* Dependency Tree */}
          {directDeps.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <ArrowDown className="h-3.5 w-3.5" />
                Inputs (depends on)
              </h3>
              <div className="space-y-2">
                {/* Current metric node */}
                <MetricNode metric={metric} isCenter />

                {/* Arrow */}
                <div className="flex justify-center">
                  <div className="w-px h-4 bg-surface-300" />
                </div>

                {/* Dependencies */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {directDeps.map((dep) => (
                    <MetricNode key={dep.slug} metric={dep} />
                  ))}
                </div>

                {/* Deeper dependencies */}
                {deps.length > directDeps.length && (
                  <div className="mt-2 pl-4 border-l-2 border-surface-200">
                    <p className="text-[10px] text-surface-400 mb-1.5">
                      Deeper dependencies:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {deps
                        .filter((d) => !directDeps.includes(d))
                        .map((dep) => (
                          <span
                            key={dep.slug}
                            className="px-2 py-0.5 rounded-md bg-surface-100 text-[10px] text-surface-500 font-medium"
                          >
                            {dep.name}
                          </span>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Reverse Dependencies */}
          {dependents.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <ArrowUp className="h-3.5 w-3.5" />
                Outputs (used by)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {dependents.map((dep) => (
                  <MetricNode key={dep.slug} metric={dep} />
                ))}
              </div>
            </div>
          )}

          {deps.length === 0 && dependents.length === 0 && (
            <div className="flex items-start gap-2 text-surface-400">
              <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <p className="text-sm">
                This is a leaf metric with no formula dependencies and nothing depends on it.
              </p>
            </div>
          )}

          {/* Benchmark */}
          {metric.benchmark && (
            <div className="rounded-xl bg-surface-50 border border-surface-200 p-4">
              <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">
                Benchmark
              </h3>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-success-500" />
                  <span className="text-xs text-surface-600">
                    Good: {metric.benchmark.direction === "higher_better" ? ">=" : "<="}{" "}
                    {metric.benchmark.good}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-warning-500" />
                  <span className="text-xs text-surface-600">
                    Warning: {metric.benchmark.direction === "higher_better" ? ">=" : "<="}{" "}
                    {metric.benchmark.warn}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-danger-500" />
                  <span className="text-xs text-surface-600">
                    {metric.benchmark.direction === "higher_better" ? "Below" : "Above"} threshold
                  </span>
                </div>
              </div>
              <p className="text-xs text-surface-400 mt-2">{metric.benchmark.label}</p>
            </div>
          )}
        </div>
      </div>
        ) : null
      }
    </Overlay>
  );
}

// ── Metric Node ──────────────────────────────────────────────────────────────

function MetricNode({
  metric,
  isCenter = false,
}: {
  metric: MetricDefinition;
  isCenter?: boolean;
}) {
  return (
    <div
      className={`
        rounded-xl border px-3 py-2 transition-colors
        ${isCenter ? "border-brand-500/40 bg-brand-500/5 ring-1 ring-brand-500/20" : tierColors[metric.tier]}
      `}
    >
      <div className="flex items-center justify-between">
        <span className={`text-sm font-medium ${isCenter ? "text-brand-700" : "text-surface-900"}`}>
          {metric.name}
        </span>
        <span className="text-[10px] text-surface-400 uppercase">
          {metric.format}
        </span>
      </div>
      <p className="text-[10px] text-surface-500 mt-0.5 line-clamp-1">
        {metric.formula}
      </p>
    </div>
  );
}
