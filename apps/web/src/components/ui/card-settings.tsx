"use client";

/**
 * CardSettings — unified per-card settings component.
 *
 * Adapts its UI based on context:
 *   - With `catalogProps`: opens a full modal (mode selector + inline metric catalog)
 *   - Without `catalogProps`: opens a lightweight portal-based popover (mode selector only)
 *
 * Replaces both CardSettingsModal and CardModePopover with a single component.
 */

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
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
    detail:
      "The companion analyzes your data and chooses the most relevant metric for this card based on context and trends.",
  },
  {
    value: "dynamic",
    label: "Dynamic",
    icon: Zap,
    description: "Data-driven defaults",
    detail:
      "Smart defaults based on your data. Metrics are chosen deterministically using rules and thresholds.",
  },
  {
    value: "custom",
    label: "Custom",
    icon: SlidersHorizontal,
    description: "Your configuration",
    detail:
      "Choose exactly which metric this card displays. Browse the full catalog below.",
  },
];

// ── Catalog types ─────────────────────────────────────────────────────────────

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

export interface CatalogProps {
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
  swapMode?: boolean;
  stagedSlug?: string | null;
}

// ── Main Component ────────────────────────────────────────────────────────────

export interface CardSettingsProps {
  currentMode: CardMode;
  onModeChange: (mode: CardMode | null) => void;
  isOverride?: boolean;
  aiEnabled?: boolean;
  /** When provided, settings opens as modal with inline catalog. Otherwise opens as popover. */
  catalogProps?: CatalogProps;
  /** Popover alignment (only used in popover variant) */
  align?: "left" | "right";
}

export function CardSettings({
  currentMode,
  onModeChange,
  isOverride = false,
  aiEnabled = false,
  catalogProps,
  align = "right",
}: CardSettingsProps) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);

  const close = useCallback(() => {
    setOpen(false);
    setHovered(false);
  }, []);

  // Catalog present → use modal; otherwise → use popover
  const variant = catalogProps ? "modal" : "popover";

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        if (!open) setHovered(false);
      }}
    >
      {/* Shared gear trigger */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen(true);
        }}
        className={`
          p-1.5 rounded-full transition-all duration-200 shadow-sm border
          ${
            open || hovered
              ? "opacity-100 bg-surface-0 border-surface-300 text-surface-600 scale-100"
              : "opacity-30 group-hover:opacity-70 scale-95 bg-surface-0 border-surface-200 text-surface-400"
          }
        `}
        title="Card settings"
        aria-label="Card settings"
        aria-expanded={open}
      >
        <Settings className="h-3 w-3" />
      </button>

      {/* Variant-specific UI */}
      {variant === "modal" ? (
        <SettingsModal
          open={open}
          onClose={close}
          currentMode={currentMode}
          onModeChange={onModeChange}
          isOverride={isOverride}
          aiEnabled={aiEnabled}
          catalogProps={catalogProps!}
        />
      ) : (
        <SettingsPopover
          open={open}
          onClose={close}
          currentMode={currentMode}
          onModeChange={onModeChange}
          isOverride={isOverride}
          aiEnabled={aiEnabled}
          align={align}
          triggerRef={null}
        />
      )}
    </div>
  );
}

// ── Modal Variant ─────────────────────────────────────────────────────────────

function SettingsModal({
  open,
  onClose,
  currentMode,
  onModeChange,
  isOverride,
  aiEnabled,
  catalogProps,
}: {
  open: boolean;
  onClose: () => void;
  currentMode: CardMode;
  onModeChange: (mode: CardMode | null) => void;
  isOverride: boolean;
  aiEnabled: boolean;
  catalogProps: CatalogProps;
}) {
  const [stagedSlug, setStagedSlug] = useState<string | null>(null);

  const handleSelect = useCallback(
    (mode: CardMode) => {
      onModeChange(mode);
    },
    [onModeChange]
  );

  const handleReset = useCallback(() => {
    onModeChange(null);
    onClose();
  }, [onModeChange, onClose]);

  return (
    <Modal
      open={open}
      onClose={() => {
        setStagedSlug(null);
        onClose();
      }}
      title="Card Settings"
      size={currentMode === "custom" && catalogProps ? "xl" : "md"}
    >
      <div className="space-y-5">
        {/* Mode selection */}
        <ModeSelector
          currentMode={currentMode}
          onSelect={handleSelect}
          aiEnabled={aiEnabled}
          variant="detailed"
        />

        {/* Inline catalog: shown in Custom mode, or always when swapping a hero card */}
        {(currentMode === "custom" || catalogProps.swapMode) && (
          <InlineCatalog
            {...catalogProps}
            onSelect={
              catalogProps.swapMode
                ? (slug) => setStagedSlug(slug)
                : catalogProps.onSelect
            }
            stagedSlug={catalogProps.swapMode ? stagedSlug : null}
          />
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
            <span className="text-xs text-surface-400">
              Using global default
            </span>
          )}
          <button
            onClick={() => {
              if (stagedSlug && catalogProps.swapMode) {
                catalogProps.onSelect(stagedSlug);
              }
              setStagedSlug(null);
              onClose();
            }}
            className="px-4 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Popover Variant ───────────────────────────────────────────────────────────

function SettingsPopover({
  open,
  onClose,
  currentMode,
  onModeChange,
  isOverride,
  aiEnabled,
  align,
}: {
  open: boolean;
  onClose: () => void;
  currentMode: CardMode;
  onModeChange: (mode: CardMode | null) => void;
  isOverride: boolean;
  aiEnabled: boolean;
  align: "left" | "right";
  triggerRef: null; // Unused — we find the trigger via parent
}) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverPos, setPopoverPos] = useState<{
    top: number;
    left: number;
  } | null>(null);

  // Position relative to the gear button (parent's first button child)
  useEffect(() => {
    if (!open) return;
    const trigger = popoverRef.current
      ?.closest(".relative")
      ?.querySelector("button");
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setPopoverPos({
      top: rect.bottom + 4,
      left: align === "right" ? rect.right - 192 : rect.left,
    });
  }, [open, align]);

  // Reposition on scroll/resize
  useEffect(() => {
    if (!open) return;
    function reposition() {
      const trigger = popoverRef.current
        ?.closest(".relative")
        ?.querySelector("button");
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      setPopoverPos({
        top: rect.bottom + 4,
        left: align === "right" ? rect.right - 192 : rect.left,
      });
    }
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, align]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const parent = popoverRef.current?.closest(".relative");
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        parent &&
        !parent.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const handleSelect = useCallback(
    (mode: CardMode) => {
      onModeChange(mode);
      onClose();
    },
    [onModeChange, onClose]
  );

  const handleReset = useCallback(() => {
    onModeChange(null);
    onClose();
  }, [onModeChange, onClose]);

  if (!open || !popoverPos) return null;

  return createPortal(
    <div
      ref={popoverRef}
      style={{
        position: "fixed",
        top: popoverPos.top,
        left: popoverPos.left,
        zIndex: 9999,
      }}
      className="w-48 rounded-xl bg-surface-0 border border-surface-200 shadow-lg shadow-black/5 py-1 animate-scale-in origin-top-right"
      role="menu"
    >
      <div className="px-3 py-1.5 border-b border-surface-100">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-surface-400">
          Card Mode
        </span>
      </div>

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
              w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors
              ${
                isActive
                  ? "bg-brand-50 text-brand-700"
                  : isDisabled
                    ? "text-surface-300 cursor-not-allowed"
                    : "text-surface-600 hover:bg-surface-50 hover:text-surface-900"
              }
            `}
            role="menuitem"
          >
            <Icon
              className={`h-3.5 w-3.5 flex-shrink-0 ${isActive ? "text-brand-600" : ""}`}
            />
            <div className="flex-1 min-w-0">
              <span className="text-xs font-medium block">{m.label}</span>
              <span className="text-[10px] text-surface-400 block">
                {isDisabled ? "Requires AI" : m.description}
              </span>
            </div>
            {isActive && (
              <div className="h-1.5 w-1.5 rounded-full bg-brand-500 flex-shrink-0" />
            )}
          </button>
        );
      })}

      {isOverride && (
        <>
          <div className="border-t border-surface-100 my-1" />
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleReset();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs font-medium text-surface-500 hover:bg-surface-50 hover:text-surface-700 transition-colors"
            role="menuitem"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset to default</span>
          </button>
        </>
      )}
    </div>,
    document.body
  );
}

// ── Mode Selector (shared by modal variant) ──────────────────────────────────

function ModeSelector({
  currentMode,
  onSelect,
  aiEnabled,
  variant,
}: {
  currentMode: CardMode;
  onSelect: (mode: CardMode) => void;
  aiEnabled: boolean;
  variant: "detailed";
}) {
  return (
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
                if (!isDisabled) onSelect(m.value);
              }}
              disabled={isDisabled}
              className={`
                w-full flex items-start gap-3 px-4 py-3 rounded-xl text-left transition-all border
                ${
                  isActive
                    ? "bg-brand-50 border-brand-200 ring-1 ring-brand-500/20"
                    : isDisabled
                      ? "bg-surface-50 border-surface-100 cursor-not-allowed opacity-50"
                      : "bg-surface-0 border-surface-200 hover:border-surface-300 hover:bg-surface-50"
                }
              `}
              role="radio"
              aria-checked={isActive}
            >
              <div
                className={`mt-0.5 p-1.5 rounded-lg ${isActive ? "bg-brand-100 text-brand-600" : "bg-surface-100 text-surface-400"}`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-medium ${isActive ? "text-brand-700" : isDisabled ? "text-surface-400" : "text-surface-900"}`}
                  >
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
                <p
                  className={`text-xs mt-0.5 ${isActive ? "text-brand-600/80" : "text-surface-400"}`}
                >
                  {variant === "detailed" ? m.detail : m.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
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
  stagedSlug = null,
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
          All{" "}
          <span
            className={
              selectedCategory === "all" ? "text-white/70" : "text-surface-400"
            }
          >
            {registry.length}
          </span>
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
            {cat.label}{" "}
            <span
              className={
                selectedCategory === cat.key
                  ? "text-white/70"
                  : "text-surface-400"
              }
            >
              {cat.count}
            </span>
          </button>
        ))}
      </div>

      {/* Metric list */}
      <div className="max-h-64 overflow-y-auto rounded-xl border border-surface-200">
        {Array.from(grouped.entries()).map(([category, metrics]) => (
          <div
            key={category}
            className="border-b border-surface-100 last:border-b-0"
          >
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
                const isStaged = stagedSlug === metric.slug;

                return (
                  <div
                    key={metric.slug}
                    className={`px-4 py-2.5 ${isStaged ? "bg-brand-50/60" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() =>
                              setExpandedSlug(
                                isExpanded ? null : metric.slug
                              )
                            }
                            className="flex items-center gap-1 group"
                          >
                            <ChevronRight
                              className={`h-3 w-3 text-surface-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                            />
                            <span className="text-xs font-medium text-surface-900 group-hover:text-brand-600 transition-colors">
                              {metric.name}
                            </span>
                          </button>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${tierColors[metric.tier] ?? ""}`}
                          >
                            {tierLabels[metric.tier] ?? metric.tier}
                          </span>
                          {metric.requiresSaaS && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-violet-500/10 text-violet-500">
                              SaaS
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-surface-400 mt-0.5 ml-4">
                          {metric.description}
                        </p>
                      </div>

                      <div className="flex-shrink-0">
                        {swapMode ? (
                          <button
                            onClick={() => onSelect(metric.slug)}
                            className={`px-2 py-1 rounded-lg transition-colors text-[10px] font-medium ${
                              stagedSlug === metric.slug
                                ? "bg-brand-600 text-white ring-1 ring-brand-500"
                                : "bg-brand-500/10 text-brand-600 hover:bg-brand-500/20"
                            }`}
                            title="Select this metric"
                          >
                            {stagedSlug === metric.slug
                              ? "Selected"
                              : "Select"}
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
                          <span className="text-[9px] text-surface-400 px-1.5">
                            Hero
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="mt-2 ml-4 space-y-2">
                        <div className="rounded-lg bg-surface-50 border border-surface-200 px-3 py-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] font-medium text-surface-500 uppercase tracking-wider">
                              Formula
                            </span>
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
                          <code className="text-[10px] text-surface-700 font-mono block">
                            {metric.formula}
                          </code>
                        </div>
                        {deps.length > 0 && (
                          <div className="flex items-start gap-1.5">
                            <Info className="h-3 w-3 text-surface-400 mt-0.5 flex-shrink-0" />
                            <span className="text-[9px] text-surface-500">
                              Depends on:{" "}
                              {deps
                                .map((d) => getMetricDef(d)?.name ?? d)
                                .join(", ")}
                            </span>
                          </div>
                        )}
                        {dependents.length > 0 && (
                          <div className="flex items-start gap-1.5">
                            <Info className="h-3 w-3 text-surface-400 mt-0.5 flex-shrink-0" />
                            <span className="text-[9px] text-surface-500">
                              Used by:{" "}
                              {dependents
                                .map((d) => getMetricDef(d)?.name ?? d)
                                .join(", ")}
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
                            <span className="text-[9px] text-surface-500">
                              {metric.benchmark.label}
                            </span>
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
            <p className="text-xs text-surface-400">
              No metrics match your search
            </p>
          </div>
        )}
      </div>

      <p className="text-[10px] text-surface-400 text-center">
        {usedSlugs.size} metrics on dashboard
      </p>
    </div>
  );
}
