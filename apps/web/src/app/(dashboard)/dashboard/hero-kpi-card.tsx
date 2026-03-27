"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Wallet,
  Flame,
  Clock,
  TrendingUp,
  DollarSign,
  Zap,
  BarChart3,
  Banknote,
  ArrowUpRight,
  Plus,
  Info,
  type LucideIcon,
} from "lucide-react";
import { CardSettingsModal } from "@/components/ui/card-settings-modal";
import { useMetrics } from "@/components/providers/metrics-context";
import { useDashboardLayout } from "./dashboard-layout-context";
import { useAiFlags } from "@/components/ai/ai-feature-context";
import {
  CATEGORY_META,
  getMetricDef,
  getMetricDependencyTree,
  getMetricDependents,
} from "@burnless/engine";

/* ── Mini sparkline — pure SVG, zero dependencies ─────────────────────────── */

function Sparkline({
  data,
  color,
  height = 32,
  width = 80,
}: {
  data: number[];
  color: string;
  height?: number;
  width?: number;
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  });

  const gradientId = `spark-${color.replace("#", "")}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.2} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path
        d={`M${points.join(" L")} L${width},${height} L0,${height} Z`}
        fill={`url(#${gradientId})`}
      />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ── Animated number counter ──────────────────────────────────────────────── */

function AnimatedValue({ value }: { value: string }) {
  const [displayed, setDisplayed] = useState(value);
  const prevRef = useRef(value);
  const rafRef = useRef<number>(0);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    // Only animate if it looks like a number (starts with $ or is numeric)
    const numericMatch = value.match(/^(\$?)([\d,.]+)(.*)$/);
    if (!numericMatch) {
      setDisplayed(value);
      prevRef.current = value;
      return;
    }

    const [, prefix, numStr, suffix] = numericMatch;
    const target = parseFloat(numStr!.replace(/,/g, ""));
    if (isNaN(target)) {
      setDisplayed(value);
      prevRef.current = value;
      return;
    }

    // Parse previous value for transition
    const prevMatch = prevRef.current.match(/^(\$?)([\d,.]+)(.*)$/);
    const start = prevMatch ? parseFloat(prevMatch[2]!.replace(/,/g, "")) : 0;
    prevRef.current = value;

    if (start === target) {
      setDisplayed(value);
      return;
    }

    const duration = 600;
    const startTime = performance.now();
    const hasDecimal = numStr!.includes(".");
    const decimals = hasDecimal ? (numStr!.split(".")[1]?.length ?? 0) : 0;
    // Check if original uses "k" or "M" suffix (compact format)
    const isCompact = /[kM]$/.test(suffix ?? "");

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + (target - start) * eased;

      if (isCompact && decimals > 0) {
        setDisplayed(`${prefix}${current.toFixed(decimals)}${suffix}`);
      } else if (hasDecimal) {
        setDisplayed(`${prefix}${current.toFixed(decimals)}${suffix}`);
      } else {
        setDisplayed(`${prefix}${Math.round(current).toLocaleString("en-US")}${suffix}`);
      }

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplayed(value);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <span className="display-number tabular-nums transition-all duration-300">
      {displayed}
    </span>
  );
}

/* ── Icon & Color Maps ────────────────────────────────────────────────────── */

const ICON_MAP: Record<string, LucideIcon> = {
  Wallet,
  Flame,
  Clock,
  TrendingUp,
  DollarSign,
  Zap,
  BarChart3,
  Banknote,
  ArrowUpRight,
};

/** Map metric color keys to Tailwind classes and hex values for sparklines */
const COLOR_MAP: Record<string, { accent: string; spark: string; glow: string }> = {
  emerald: { accent: "text-emerald-500", spark: "#10b981", glow: "from-emerald-500/5 to-transparent" },
  orange: { accent: "text-orange-500", spark: "#f97316", glow: "from-orange-500/5 to-transparent" },
  blue: { accent: "text-brand-500", spark: "#3b82f6", glow: "from-brand-500/5 to-transparent" },
  violet: { accent: "text-violet-500", spark: "#8b5cf6", glow: "from-violet-500/5 to-transparent" },
  teal: { accent: "text-highlight-500", spark: "#14b8a6", glow: "from-highlight-500/5 to-transparent" },
  amber: { accent: "text-amber-500", spark: "#f59e0b", glow: "from-amber-500/5 to-transparent" },
  red: { accent: "text-danger-500", spark: "#ef4444", glow: "from-danger-500/5 to-transparent" },
  pink: { accent: "text-pink-500", spark: "#ec4899", glow: "from-pink-500/5 to-transparent" },
};

const DEFAULT_COLOR = COLOR_MAP.emerald;

/* ── KPI Card ─────────────────────────────────────────────────────────────── */

export type KpiVariant = "cash" | "burn" | "runway" | "revenue";

const variantConfig: Record<
  KpiVariant,
  {
    icon: LucideIcon;
    accentColor: string;
    sparkColor: string;
    glowClass: string;
    href: string;
  }
> = {
  cash: {
    icon: Wallet,
    accentColor: "text-emerald-500",
    sparkColor: "#10b981",
    glowClass: "from-emerald-500/5 to-transparent",
    href: "/funding",
  },
  burn: {
    icon: Flame,
    accentColor: "text-orange-500",
    sparkColor: "#f97316",
    glowClass: "from-orange-500/5 to-transparent",
    href: "/expenses",
  },
  runway: {
    icon: Clock,
    accentColor: "text-brand-500",
    sparkColor: "#3b82f6",
    glowClass: "from-brand-500/5 to-transparent",
    href: "/scenarios",
  },
  revenue: {
    icon: TrendingUp,
    accentColor: "text-highlight-500",
    sparkColor: "#14b8a6",
    glowClass: "from-highlight-500/5 to-transparent",
    href: "/revenue",
  },
};

export interface HeroKpiCardProps {
  variant: KpiVariant;
  label: string;
  value: string;
  change?: string;
  changeLabel?: string;
  description?: string;
  sparkData?: number[];
  /** Animation stagger index (0-based) */
  stagger?: number;
  /** Metric slug for per-card mode overrides */
  slug?: string;
  celebrate?: boolean;
  /** Auto-swap info — when this card replaces an empty default */
  swapInfo?: {
    /** The original metric slug that was replaced */
    replacedSlug: string;
    /** The original metric label */
    replacedLabel: string;
    /** Hint telling user what data to add to restore the original */
    restoreHint: string;
  };
  /** Override icon/color/href from metric definition (for swapped cards) */
  metricStyle?: {
    icon: string;
    color: string;
    href: string;
  };
  /** Index in the hero card grid — enables swap mode in card settings */
  heroCardIndex?: number;
}

/** Returns true if the value is a placeholder (ghost state). */
function isGhost(value: string): boolean {
  return value === "$---" || value === "-- mo";
}

export function HeroKpiCard({
  variant,
  label,
  value,
  change,
  changeLabel,
  description,
  sparkData,
  stagger = 0,
  celebrate = false,
  slug,
  swapInfo,
  metricStyle,
  heroCardIndex,
}: HeroKpiCardProps) {
  // Resolve visual config: use metricStyle (for swapped cards) or variant config
  const resolvedConfig = useMemo(() => {
    if (metricStyle) {
      const colorSet = (COLOR_MAP[metricStyle.color] ?? DEFAULT_COLOR)!;
      const IconComp = ICON_MAP[metricStyle.icon] ?? TrendingUp;
      return {
        icon: IconComp,
        accentColor: colorSet.accent,
        sparkColor: colorSet.spark,
        glowClass: colorSet.glow,
        href: metricStyle.href,
      };
    }
    return variantConfig[variant];
  }, [variant, metricStyle]);

  const Icon = resolvedConfig.icon;
  const router = useRouter();
  const ghost = isGhost(value);

  // For change color, use direction-aware logic
  const isLowerBetter = variant === "burn" || metricStyle?.color === "orange";

  // Per-card mode from intelligence context
  const {
    getCardMode: getCardModeRaw, setCardMode: setCardModeRaw, mode: globalMode,
    registry, openFormulaViewer,
  } = useMetrics();
  const {
    heroCards, secondaryMetrics,
    swapHeroCard, addSecondaryMetric, removeSecondaryMetric,
  } = useDashboardLayout();
  const getCardMode = (slug: string) => getCardModeRaw("dashboard", slug);
  const setCardMode = (slug: string, mode: typeof globalMode | null) => setCardModeRaw("dashboard", slug, mode);
  const { masterEnabled: aiEnabled } = useAiFlags();
  const cardSlug = slug ?? variant;
  const cardMode = getCardMode(cardSlug);
  const isOverride = cardMode !== globalMode;
  const isHeroSwapMode = heroCardIndex !== undefined;
  const allUsedSlugs = useMemo(
    () => new Set([...heroCards, ...secondaryMetrics]),
    [heroCards, secondaryMetrics]
  );
  const catalogProps = useMemo(() => ({
    registry,
    usedSlugs: allUsedSlugs,
    heroSlugs: heroCards,
    onSelect: isHeroSwapMode
      ? (newSlug: string) => {
          swapHeroCard(heroCardIndex, newSlug).then(() => router.refresh());
        }
      : addSecondaryMetric,
    onRemove: removeSecondaryMetric,
    onViewFormula: openFormulaViewer,
    categoryMeta: CATEGORY_META as Record<string, { label: string }>,
    getDependencyTree: getMetricDependencyTree,
    getDependents: getMetricDependents,
    getMetricDef: getMetricDef as (slug: string) => { slug: string; name: string; description: string; formula: string; category: string; tier: string; requiresSaaS?: boolean; benchmark?: { label: string } } | undefined,
    swapMode: isHeroSwapMode,
  }), [registry, allUsedSlugs, heroCards, isHeroSwapMode, heroCardIndex, swapHeroCard, addSecondaryMetric, removeSecondaryMetric, openFormulaViewer, router]);

  const isPositive = change?.startsWith("+");
  const isNegative = change?.startsWith("-");
  const changeColor = isLowerBetter
    ? isPositive
      ? "text-danger-500"
      : isNegative
        ? "text-success-500"
        : "text-surface-400"
    : isPositive
      ? "text-success-500"
      : isNegative
        ? "text-danger-500"
        : "text-surface-400";

  // Track whether settings popover was recently used to prevent accidental navigation
  const settingsActiveRef = useRef(false);

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => {
        if (settingsActiveRef.current) {
          settingsActiveRef.current = false;
          return;
        }
        router.push(resolvedConfig.href);
      }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") router.push(resolvedConfig.href); }}
      className={`
        h-full flex flex-col group relative cursor-pointer overflow-visible
        rounded-2xl border
        p-5 sm:p-6
        transition-all duration-300
        animate-slide-up stagger-${stagger + 1}
        ${ghost
          ? "bg-surface-0 border-surface-200/80 hover:border-brand-300 hover:bg-brand-50/30"
          : "bg-surface-0 border-surface-200 hover:border-surface-300 hover-lift"
        }
        ${celebrate ? "animate-celebrate" : ""}
      `}
    >
      {/* Subtle gradient glow */}
      <div
        className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${ghost ? "from-brand-500/5 to-transparent" : resolvedConfig.glowClass} opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`}
      />

      {/* Per-card mode gear — always visible so users can switch metrics even on empty cards */}
      <div
        className="absolute -top-3 right-3 z-20 rounded-full bg-surface-0 ring-1 ring-surface-200"
        onMouseDown={() => { settingsActiveRef.current = true; }}
      >
        <CardSettingsModal
          currentMode={cardMode}
          onModeChange={(mode) => setCardMode(cardSlug, mode)}
          isOverride={isOverride}
          aiEnabled={aiEnabled}
          catalogProps={catalogProps}
        />
      </div>

      {/* Auto-swap indicator */}
      {swapInfo && (
        <div
          className="absolute -top-3 left-3 z-20 group/swap"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-1 rounded-full bg-surface-50 ring-1 ring-surface-200 px-2 py-0.5 text-[10px] text-surface-400 cursor-help">
            <Info className="h-3 w-3" />
            <span className="hidden sm:inline">Swapped</span>
          </div>
          <div className="absolute left-0 top-full mt-1 w-48 rounded-lg bg-surface-900 text-surface-0 text-xs p-2.5 shadow-lg opacity-0 pointer-events-none group-hover/swap:opacity-100 group-hover/swap:pointer-events-auto transition-opacity z-30">
            <p className="font-medium mb-1">Replaces: {swapInfo.replacedLabel}</p>
            <p className="text-surface-300">{swapInfo.restoreHint}</p>
          </div>
        </div>
      )}

      <div className="relative z-10 flex-1 flex flex-col justify-between">
        {/* Header: icon + label */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={ghost ? "text-surface-400" : resolvedConfig.accentColor}>
              <Icon className="h-4 w-4" strokeWidth={2} />
            </div>
            <span className={`text-xs font-medium uppercase tracking-wider ${ghost ? "text-surface-400" : "text-surface-400"}`}>
              {label}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {!ghost && sparkData && sparkData.length >= 2 && (
              <div className="hidden sm:block">
                <Sparkline data={sparkData} color={resolvedConfig.sparkColor} />
              </div>
            )}
          </div>
        </div>

        {ghost ? (
          /* Empty card prompt — actionable instead of disabled */
          <div className="space-y-2">
            <p className="text-sm font-medium text-surface-500">No data yet</p>
            {description && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(resolvedConfig.href);
                }}
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
              >
                <Plus className="h-3 w-3" />
                {description}
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Value */}
            <div className="text-2xl sm:text-3xl font-bold leading-none mb-2 text-surface-900">
              <AnimatedValue value={value} />
            </div>

            {/* Change + Description */}
            <div className="flex items-center gap-2 flex-wrap">
              {change && (
                <span className={`text-xs font-semibold ${changeColor}`}>
                  {change}
                </span>
              )}
              {changeLabel && (
                <span className="text-xs text-surface-400">{changeLabel}</span>
              )}
              {description && !change && (
                <span className="text-xs text-surface-400">{description}</span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
