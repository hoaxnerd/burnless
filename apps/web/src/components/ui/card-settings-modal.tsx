"use client";

/**
 * CardSettingsModal — unified modal for per-card/per-widget settings.
 * Replaces the old CardModePopover with a full modal that presents
 * Intelligence / Dynamic / Custom modes, and in Custom mode lets
 * users browse and select from the stats catalog inline.
 */

import { useState, useMemo, useCallback } from "react";
import {
  Settings,
  Brain,
  Zap,
  SlidersHorizontal,
  RotateCcw,
  Search,
  Plus,
  Minus,
  ChevronRight,
  GitBranch,
  Info,
  Check,
} from "lucide-react";
import { Modal } from "./modal";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CardMode = "intelligence" | "dynamic" | "custom";

interface ModeOption {
  value: CardMode;
  label: string;
  icon: typeof Brain;
  description: string;
  detail: string;
}

const MODES: ModeOption[] = [
  {
    value: "intelligence",
    label: "Intelligence",
    icon: Brain,
    description: "AI decides what to show",
    detail: "The AI companion analyzes your data and chooses the most relevant metric for this card based on context and trends.",
  },
  {
    value: "dynamic",
    label: "Dynamic",
    icon: Zap,
    description: "Data-driven defaults",
    detail: "Smart defaults based on your data. Metrics are chosen deterministically using rules and thresholds.",
  },
  {
    value: "custom",
    label: "Custom",
    icon: SlidersHorizontal,
    description: "Your configuration",
    detail: "Choose exactly which metric this card displays. Browse the full catalog below.",
  },
];

// ── Catalog types (imported from engine at usage site) ────────────────────────

interface MetricDef {
  slug: string;
  name: string;
  description: string;
  formula: string;
  category: string;
  tier: string;
  requiresSaaS?: boolean;
  benchmark?: { label: string };
}

interface CatalogProps {
  registry: MetricDef[];
  usedSlugs: Set<string>;
  heroSlugs: string[];
  onSelect: (slug: string) => void;
  onRemove: (slug: string) => void;
  onViewFormula?: (slug: string) => void;
  categoryMeta: Record<string, { label: string }>;
  getDependencyTree: (slug: string) => string[];
  getDependents: (slug: string) => string[];
  getMetricDef: (slug: string) => MetricDef | undefined;
  /** When true, catalog is in "swap hero card" mode — shows Swap button instead of Add */
  swapMode?: boolean;
}

// ── Main Component ────────────────────────────────────────────────────────────

export interface CardSettingsModalProps {
  /** Current effective mode for this card */
  currentMode: CardMode;
  /** Called when user picks a mode (null = reset to default) */
  onModeChange: (mode: CardMode | null) => void;
  /** Whether this card has a per-card override (vs inheriting default) */
  isOverride?: boolean;
  /** Whether AI features are enabled */
  aiEnabled?: boolean;
  /** Props for the inline stats catalog (Custom mode) */
  catalogProps?: CatalogProps;
}

export function CardSettingsModal({
  currentMode,
  onModeChange,
  isOverride = false,
  aiEnabled = false,
  catalogProps,
}: CardSettingsModalProps) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);

  const handleSelect = useCallback(
    (mode: CardMode) => {
      onModeChange(mode);
    },
    [onModeChange]
  );

  const handleReset = useCallback(() => {
    onModeChange(null);
    setOpen(false);
  }, [onModeChange]);

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { if (!open) setHovered(false); }}
    >
      {/* Gear trigger */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen(true);
        }}
        className={`
          p-1.5 rounded-full transition-all duration-200 shadow-sm border
          ${open || hovered
            ? "opacity-100 bg-surface-0 border-surface-300 text-surface-600 scale-100"
            : "opacity-30 group-hover:opacity-70 scale-95 bg-surface-0 border-surface-200 text-surface-400"
          }
        `}
        title="Card settings"
        aria-label="Card settings"
      >
        <Settings className="h-3 w-3" />
      </button>

      {/* Modal */}
      <Modal
        open={open}
        onClose={() => { setOpen(false); setHovered(false); }}
        title="Card Settings"
        size={currentMode === "custom" && catalogProps ? "xl" : "md"}
      >
        <div className="space-y-5">
          {/* Mode selection */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-surface-500 uppercase tracking-wider">
              Display Mode
            </p>
            <div className="grid gap-2">
              {MODES.map((m) => {
                const Icon = m.icon;
                const isActive = currentMode === m.value;
                const isDisabled = m.value === "intelligence" && !aiEnabled;

                return (
                  <button
                    key={m.value}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isDisabled) handleSelect(m.value);
                    }}
                    disabled={isDisabled}
                    className={`
                      w-full flex items-start gap-3 px-4 py-3 rounded-xl text-left transition-all border
                      ${isActive
                        ? "bg-brand-50 border-brand-200 ring-1 ring-brand-500/20"
                        : isDisabled
                          ? "bg-surface-50 border-surface-100 cursor-not-allowed opacity-50"
                          : "bg-surface-0 border-surface-200 hover:border-surface-300 hover:bg-surface-50"
                      }
                    `}
                    role="radio"
                    aria-checked={isActive}
                  >
                    <div className={`mt-0.5 p-1.5 rounded-lg ${isActive ? "bg-brand-100 text-brand-600" : "bg-surface-100 text-surface-400"}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${isActive ? "text-brand-700" : isDisabled ? "text-surface-400" : "text-surface-900"}`}>
                          {m.label}
                        </span>
                        {isDisabled && (
                          <span className="text-[10px] bg-surface-200 text-surface-500 px-1.5 py-0.5 rounded">
                            Requires AI
                          </span>
                        )}
                        {isActive && (
                          <Check className="h-3.5 w-3.5 text-brand-500" />
                        )}
                      </div>
                      <p className={`text-xs mt-0.5 ${isActive ? "text-brand-600/80" : "text-surface-400"}`}>
                        {m.detail}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Inline catalog when Custom mode is active */}
          {currentMode === "custom" && catalogProps && (
            <InlineCatalog {...catalogProps} />
          )}

          {/* Footer actions */}
          <div className="flex items-center justify-between pt-2 border-t border-surface-100">
            {isOverride ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleReset();
                }}
                className="flex items-center gap-1.5 text-xs font-medium text-surface-500 hover:text-surface-700 transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset to default
              </button>
            ) : (
              <span className="text-xs text-surface-400">Using global default</span>
            )}
            <button
              onClick={() => { setOpen(false); setHovered(false); }}
              className="px-4 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── Inline Catalog (embedded in modal for Custom mode) ────────────────────────

const tierColors: Record<string, string> = {
  core: "bg-brand-500/10 text-brand-600",
  advanced: "bg-violet-500/10 text-violet-600",
  deep: "bg-surface-500/10 text-surface-500",
};

const tierLabels: Record<string, string> = {
  core: "Core",
  advanced: "Advanced",
  deep: "Deep",
};

function InlineCatalog({
  registry,
  usedSlugs,
  heroSlugs,
  onSelect,
  onRemove,
  onViewFormula,
  categoryMeta,
  getDependencyTree,
  getDependents,
  getMetricDef,
  swapMode = false,
}: CatalogProps) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);

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

  const grouped = useMemo(() => {
    const groups = new Map<string, MetricDef[]>();
    for (const m of filtered) {
      const existing = groups.get(m.category) ?? [];
      existing.push(m);
      groups.set(m.category, existing);
    }
    return groups;
  }, [filtered]);

  const categories = useMemo(() => {
    const cats: Array<{ key: string; label: string; count: number }> = [];
    for (const [key, meta] of Object.entries(categoryMeta)) {
      const count = registry.filter((m) => m.category === key).length;
      if (count > 0) cats.push({ key, label: meta.label, count });
    }
    return cats;
  }, [registry, categoryMeta]);

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-surface-500 uppercase tracking-wider">
        {swapMode ? "Select a metric to replace this card" : "Select Metric"}
      </p>

      {/* Search */}
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

      {/* Category pills */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
        <button
          onClick={() => setSelectedCategory("all")}
          className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            selectedCategory === "all"
              ? "bg-brand-500 text-white"
              : "bg-surface-100 text-surface-500 hover:bg-surface-200"
          }`}
        >
          All <span className={selectedCategory === "all" ? "text-white/70" : "text-surface-400"}>{registry.length}</span>
        </button>
        {categories.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setSelectedCategory(cat.key)}
            className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              selectedCategory === cat.key
                ? "bg-brand-500 text-white"
                : "bg-surface-100 text-surface-500 hover:bg-surface-200"
            }`}
          >
            {cat.label} <span className={selectedCategory === cat.key ? "text-white/70" : "text-surface-400"}>{cat.count}</span>
          </button>
        ))}
      </div>

      {/* Metric list */}
      <div className="max-h-64 overflow-y-auto rounded-xl border border-surface-200">
        {Array.from(grouped.entries()).map(([category, metrics]) => (
          <div key={category} className="border-b border-surface-100 last:border-b-0">
            <div className="px-4 py-1.5 bg-surface-50 sticky top-0">
              <h4 className="text-[10px] font-semibold text-surface-500 uppercase tracking-wider">
                {categoryMeta[category]?.label ?? category}
              </h4>
            </div>
            <div className="divide-y divide-surface-100">
              {metrics.map((metric) => {
                const isUsed = usedSlugs.has(metric.slug);
                const isHero = heroSlugs.includes(metric.slug);
                const isExpanded = expandedSlug === metric.slug;
                const deps = getDependencyTree(metric.slug);
                const dependents = getDependents(metric.slug);

                return (
                  <div key={metric.slug} className="px-4 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setExpandedSlug(isExpanded ? null : metric.slug)}
                            className="flex items-center gap-1 group"
                          >
                            <ChevronRight
                              className={`h-3 w-3 text-surface-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                            />
                            <span className="text-xs font-medium text-surface-900 group-hover:text-brand-600 transition-colors">
                              {metric.name}
                            </span>
                          </button>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${tierColors[metric.tier] ?? ""}`}>
                            {tierLabels[metric.tier] ?? metric.tier}
                          </span>
                          {metric.requiresSaaS && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-violet-500/10 text-violet-500">
                              SaaS
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-surface-400 mt-0.5 ml-4">{metric.description}</p>
                      </div>

                      <div className="flex-shrink-0">
                        {swapMode ? (
                          <button
                            onClick={() => onSelect(metric.slug)}
                            className="px-2 py-1 rounded-lg bg-brand-500/10 text-brand-600 hover:bg-brand-500/20 transition-colors text-[10px] font-medium"
                            title="Swap this card"
                          >
                            Swap
                          </button>
                        ) : isUsed && !isHero ? (
                          <button
                            onClick={() => onRemove(metric.slug)}
                            className="p-1 rounded-lg bg-danger-500/10 text-danger-500 hover:bg-danger-500/20 transition-colors"
                            title="Remove from dashboard"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                        ) : !isUsed ? (
                          <button
                            onClick={() => onSelect(metric.slug)}
                            className="p-1 rounded-lg bg-brand-500/10 text-brand-600 hover:bg-brand-500/20 transition-colors"
                            title="Add to dashboard"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        ) : (
                          <span className="text-[9px] text-surface-400 px-1.5">Hero</span>
                        )}
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="mt-2 ml-4 space-y-2">
                        <div className="rounded-lg bg-surface-50 border border-surface-200 px-3 py-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] font-medium text-surface-500 uppercase tracking-wider">Formula</span>
                            {onViewFormula && (
                              <button
                                onClick={() => onViewFormula(metric.slug)}
                                className="text-[9px] text-brand-500 hover:underline flex items-center gap-0.5"
                              >
                                <GitBranch className="h-2.5 w-2.5" />
                                Dependencies
                              </button>
                            )}
                          </div>
                          <code className="text-[10px] text-surface-700 font-mono block">{metric.formula}</code>
                        </div>
                        {deps.length > 0 && (
                          <div className="flex items-start gap-1.5">
                            <Info className="h-3 w-3 text-surface-400 mt-0.5 flex-shrink-0" />
                            <span className="text-[9px] text-surface-500">
                              Depends on: {deps.map((d) => getMetricDef(d)?.name ?? d).join(", ")}
                            </span>
                          </div>
                        )}
                        {dependents.length > 0 && (
                          <div className="flex items-start gap-1.5">
                            <Info className="h-3 w-3 text-surface-400 mt-0.5 flex-shrink-0" />
                            <span className="text-[9px] text-surface-500">
                              Used by: {dependents.map((d) => getMetricDef(d)?.name ?? d).join(", ")}
                            </span>
                          </div>
                        )}
                        {metric.benchmark && (
                          <div className="flex items-center gap-1.5">
                            <div className="flex gap-0.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-success-500" />
                              <span className="w-1.5 h-1.5 rounded-full bg-warning-500" />
                              <span className="w-1.5 h-1.5 rounded-full bg-danger-500" />
                            </div>
                            <span className="text-[9px] text-surface-500">{metric.benchmark.label}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center">
            <p className="text-xs text-surface-400">No metrics match your search</p>
          </div>
        )}
      </div>

      <p className="text-[10px] text-surface-400 text-center">
        {usedSlugs.size} metrics on dashboard
      </p>
    </div>
  );
}
