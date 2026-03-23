"use client";

/**
 * Stats Catalog — browsable catalog of all available metrics.
 * Shows formula, dependencies, benchmarks, and allows adding to dashboard.
 */

import { useState, useMemo } from "react";
import {
  X,
  Search,
  Plus,
  Minus,
  ChevronRight,
  GitBranch,
  Info,
} from "lucide-react";
import {
  CATEGORY_META,
  getMetricDef,
  getMetricDependencyTree,
  getMetricDependents,
  type MetricCategory,
  type MetricDefinition,
  type MetricTier,
} from "@burnless/engine";
import { useDashboardIntelligence } from "./dashboard-intelligence-context";

// ── Tier badges ──────────────────────────────────────────────────────────────

const tierColors: Record<MetricTier, string> = {
  core: "bg-brand-500/10 text-brand-600",
  advanced: "bg-violet-500/10 text-violet-600",
  deep: "bg-surface-500/10 text-surface-500",
};

const tierLabels: Record<MetricTier, string> = {
  core: "Core",
  advanced: "Advanced",
  deep: "Deep",
};

// ── Main Component ───────────────────────────────────────────────────────────

export function StatsCatalog() {
  const {
    catalogOpen,
    catalogMode,
    setCatalogOpen,
    registry,
    heroCards,
    secondaryMetrics,
    swapHeroCard,
    addHeroCard,
    removeHeroCard,
    addSecondaryMetric,
    removeSecondaryMetric,
    openFormulaViewer,
  } = useDashboardIntelligence();

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<MetricCategory | "all">("all");
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [swapTarget, setSwapTarget] = useState<number | null>(null);

  const allUsedSlugs = useMemo(
    () => new Set([...heroCards, ...secondaryMetrics]),
    [heroCards, secondaryMetrics]
  );

  const filtered = useMemo(() => {
    let metrics = registry;
    if (selectedCategory !== "all") {
      metrics = metrics.filter((m) => m.category === selectedCategory);
    }
    if (search) {
      const q = search.toLowerCase();
      metrics = metrics.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q) ||
          m.formula.toLowerCase().includes(q) ||
          m.slug.toLowerCase().includes(q)
      );
    }
    return metrics;
  }, [registry, selectedCategory, search]);

  // Group by category
  const grouped = useMemo(() => {
    const groups = new Map<MetricCategory, MetricDefinition[]>();
    for (const m of filtered) {
      const existing = groups.get(m.category) ?? [];
      existing.push(m);
      groups.set(m.category, existing);
    }
    return groups;
  }, [filtered]);

  if (!catalogOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity"
        onClick={() => setCatalogOpen(false)}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-surface-0 border-l border-surface-200 shadow-2xl z-50 flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200">
          <div>
            <h2 className="text-lg font-bold text-surface-900">
              {catalogMode === "manage" ? "Dashboard Cards" : "Metrics Catalog"}
            </h2>
            <p className="text-xs text-surface-400 mt-0.5">
              {catalogMode === "manage"
                ? `${heroCards.length} cards on dashboard`
                : `${registry.length} metrics available`}
            </p>
          </div>
          <button
            onClick={() => setCatalogOpen(false)}
            className="p-2 rounded-lg hover:bg-surface-100 transition-colors"
          >
            <X className="h-4 w-4 text-surface-500" />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-surface-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-surface-400" />
            <input
              type="text"
              placeholder="Search metrics..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg bg-surface-50 border border-surface-200 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
          </div>
        </div>

        {/* Category filter */}
        <div className="px-6 py-2 border-b border-surface-100 flex gap-1.5 overflow-x-auto scrollbar-hide">
          <CategoryPill
            label="All"
            active={selectedCategory === "all"}
            onClick={() => setSelectedCategory("all")}
            count={registry.length}
          />
          {(Object.entries(CATEGORY_META) as [MetricCategory, { label: string }][]).map(
            ([key, meta]) => {
              const count = registry.filter((m) => m.category === key).length;
              if (count === 0) return null;
              return (
                <CategoryPill
                  key={key}
                  label={meta.label}
                  active={selectedCategory === key}
                  onClick={() => setSelectedCategory(key)}
                  count={count}
                />
              );
            }
          )}
        </div>

        {/* Swap mode banner */}
        {swapTarget !== null && (
          <div className="px-6 py-2 bg-brand-500/5 border-b border-brand-500/10">
            <p className="text-xs font-medium text-brand-600">
              Select a metric to replace hero card #{swapTarget + 1}
            </p>
            <button
              onClick={() => setSwapTarget(null)}
              className="text-xs text-brand-500 hover:underline mt-0.5"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Metric list */}
        <div className="flex-1 overflow-y-auto">
          {Array.from(grouped.entries()).map(([category, metrics]) => (
            <div key={category} className="border-b border-surface-100">
              <div className="px-6 py-2 bg-surface-50">
                <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-wider">
                  {CATEGORY_META[category]?.label ?? category}
                </h3>
              </div>
              <div className="divide-y divide-surface-100">
                {metrics.map((metric) => (
                  <MetricRow
                    key={metric.slug}
                    metric={metric}
                    isUsed={allUsedSlugs.has(metric.slug)}
                    isHero={heroCards.includes(metric.slug)}
                    isExpanded={expandedSlug === metric.slug}
                    onToggleExpand={() =>
                      setExpandedSlug(expandedSlug === metric.slug ? null : metric.slug)
                    }
                    onAdd={() => {
                      if (swapTarget !== null) {
                        swapHeroCard(swapTarget, metric.slug);
                        setSwapTarget(null);
                      } else if (catalogMode === "manage") {
                        addHeroCard(metric.slug);
                      } else {
                        addSecondaryMetric(metric.slug);
                      }
                    }}
                    onRemove={() => {
                      if (catalogMode === "manage") {
                        removeHeroCard(metric.slug);
                      } else {
                        removeSecondaryMetric(metric.slug);
                      }
                    }}
                    onViewFormula={() => openFormulaViewer(metric.slug)}
                    swapMode={swapTarget !== null}
                    manageMode={catalogMode === "manage"}
                  />
                ))}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-surface-400">No metrics match your search</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-surface-200 bg-surface-50 flex items-center justify-between">
          <p className="text-xs text-surface-400">
            {allUsedSlugs.size} metrics on dashboard
          </p>
          <button
            onClick={() => setCatalogOpen(false)}
            className="px-4 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </>
  );
}

// ── Category Pill ────────────────────────────────────────────────────────────

function CategoryPill({
  label,
  active,
  onClick,
  count,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors
        ${
          active
            ? "bg-brand-500 text-white"
            : "bg-surface-100 text-surface-500 hover:bg-surface-200"
        }
      `}
    >
      {label}
      <span className={`ml-1 ${active ? "text-white/70" : "text-surface-400"}`}>
        {count}
      </span>
    </button>
  );
}

// ── Metric Row ───────────────────────────────────────────────────────────────

function MetricRow({
  metric,
  isUsed,
  isHero,
  isExpanded,
  onToggleExpand,
  onAdd,
  onRemove,
  onViewFormula,
  swapMode,
  manageMode,
}: {
  metric: MetricDefinition;
  isUsed: boolean;
  isHero: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onAdd: () => void;
  onRemove: () => void;
  onViewFormula: () => void;
  swapMode: boolean;
  manageMode: boolean;
}) {
  const deps = getMetricDependencyTree(metric.slug);
  const dependents = getMetricDependents(metric.slug);

  return (
    <div className="px-6 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleExpand}
              className="flex items-center gap-1.5 group"
            >
              <ChevronRight
                className={`h-3.5 w-3.5 text-surface-400 transition-transform ${
                  isExpanded ? "rotate-90" : ""
                }`}
              />
              <span className="text-sm font-medium text-surface-900 group-hover:text-brand-600 transition-colors">
                {metric.name}
              </span>
            </button>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${tierColors[metric.tier]}`}>
              {tierLabels[metric.tier]}
            </span>
            {metric.requiresSaaS && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-500/10 text-violet-500">
                SaaS
              </span>
            )}
          </div>
          <p className="text-xs text-surface-400 mt-0.5 ml-5">{metric.description}</p>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {swapMode ? (
            <button
              onClick={onAdd}
              className="p-1.5 rounded-lg bg-brand-500/10 text-brand-600 hover:bg-brand-500/20 transition-colors"
              title="Use this metric"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          ) : isUsed ? (
            manageMode || !isHero ? (
              <button
                onClick={onRemove}
                className="p-1.5 rounded-lg bg-danger-500/10 text-danger-500 hover:bg-danger-500/20 transition-colors"
                title={manageMode ? "Remove card from dashboard" : "Remove from Key Metrics"}
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
            ) : (
              <span className="text-[10px] text-surface-400 px-2">Hero</span>
            )
          ) : (
            <button
              onClick={onAdd}
              className="p-1.5 rounded-lg bg-brand-500/10 text-brand-600 hover:bg-brand-500/20 transition-colors"
              title={manageMode ? "Add as dashboard card" : "Add to Key Metrics"}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="mt-3 ml-5 space-y-3">
          {/* Formula */}
          <div className="rounded-lg bg-surface-50 border border-surface-200 px-3 py-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-surface-500 uppercase tracking-wider">
                Formula
              </span>
              <button
                onClick={onViewFormula}
                className="text-[10px] text-brand-500 hover:underline flex items-center gap-0.5"
              >
                <GitBranch className="h-3 w-3" />
                View dependencies
              </button>
            </div>
            <code className="text-xs text-surface-700 font-mono block">
              {metric.formula}
            </code>
          </div>

          {/* Dependencies */}
          {deps.length > 0 && (
            <div className="flex items-start gap-2">
              <Info className="h-3.5 w-3.5 text-surface-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-[10px] font-medium text-surface-500">
                  Depends on:{" "}
                </span>
                <span className="text-[10px] text-surface-600">
                  {deps.map((d) => getMetricDef(d)?.name ?? d).join(", ")}
                </span>
              </div>
            </div>
          )}

          {/* Dependents */}
          {dependents.length > 0 && (
            <div className="flex items-start gap-2">
              <Info className="h-3.5 w-3.5 text-surface-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-[10px] font-medium text-surface-500">
                  Used by:{" "}
                </span>
                <span className="text-[10px] text-surface-600">
                  {dependents.map((d) => getMetricDef(d)?.name ?? d).join(", ")}
                </span>
              </div>
            </div>
          )}

          {/* Benchmark */}
          {metric.benchmark && (
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-success-500" />
                <span className="w-2 h-2 rounded-full bg-warning-500" />
                <span className="w-2 h-2 rounded-full bg-danger-500" />
              </div>
              <span className="text-[10px] text-surface-500">
                {metric.benchmark.label}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
