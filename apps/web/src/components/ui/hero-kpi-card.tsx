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
import { WidgetCard } from "@/components/ui/widget-card";

/* ── Mini sparkline — pure SVG, zero dependencies ─────────────────────────── */

export function Sparkline({
  data,
  color,
  height = 32,
  width = 80,
  fluid = false,
}: {
  data: number[];
  color: string;
  height?: number;
  width?: number;
  /** When true, SVG stretches to fill container width */
  fluid?: boolean;
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
      width={fluid ? "100%" : width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={fluid ? "none" : undefined}
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

export interface HeroKpiCardProps {
  slug: string;
  label: string;
  value: string;
  change?: string;
  changeLabel?: string;
  description?: string;
  sparkData?: number[];
  stagger?: number;
  celebrate?: boolean;
  hasData?: boolean;
  metricStyle?: { icon: string; color: string; href: string };
  swapInfo?: {
    replacedSlug: string;
    replacedLabel: string;
    restoreHint: string;
  };
  heroCardIndex?: number;
  lowerIsBetter?: boolean;
  pageId?: string;
  settingsPosition?: "floating" | "inset";
}

export function HeroKpiCard({
  slug,
  label,
  value,
  change,
  changeLabel,
  description,
  sparkData,
  stagger = 0,
  celebrate = false,
  hasData = true,
  swapInfo,
  metricStyle,
  heroCardIndex: _heroCardIndex,
  lowerIsBetter = false,
  pageId,
  settingsPosition,
}: HeroKpiCardProps) {
  const resolvedConfig = useMemo(() => {
    const colorKey = metricStyle?.color ?? "emerald";
    const colorSet = (COLOR_MAP[colorKey] ?? DEFAULT_COLOR)!;
    const IconComp = metricStyle?.icon ? (ICON_MAP[metricStyle.icon] ?? TrendingUp) : TrendingUp;
    const href = metricStyle?.href ?? "#";
    return {
      icon: IconComp,
      accentColor: colorSet.accent,
      sparkColor: colorSet.spark,
      glowClass: colorSet.glow,
      href,
    };
  }, [metricStyle]);

  // Directional sparkline color: green for good trend, red for bad, brand fallback
  const directionalSparkColor = useMemo(() => {
    if (!change) return resolvedConfig.sparkColor;
    const isPositive = change.startsWith("+");
    const isNegative = change.startsWith("-");
    if (!isPositive && !isNegative) return resolvedConfig.sparkColor;
    // Design tokens: success-500 (#10b981), danger-500 (#ef4444)
    // Hex required for SVG gradient stopColor compatibility
    if (lowerIsBetter) return isPositive ? "#ef4444" : "#10b981";
    return isPositive ? "#10b981" : "#ef4444";
  }, [change, lowerIsBetter, resolvedConfig.sparkColor]);

  const Icon = resolvedConfig.icon;
  const router = useRouter();
  const ghost = hasData === false;

  const isPositive = change?.startsWith("+");
  const isNegative = change?.startsWith("-");
  const changeColor = lowerIsBetter
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

  return (
    <WidgetCard
      slug={slug}
      pageId={pageId ?? "dashboard"}
      settingsPosition={settingsPosition ?? "floating"}
      stagger={stagger + 1}
      onClick={() => router.push(resolvedConfig.href)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ")
          router.push(resolvedConfig.href);
      }}
      role="link"
      tabIndex={0}
      className={`
        ${
          ghost
            ? "!border-surface-200/80 hover:!border-brand-300 hover:!bg-brand-50/30"
            : ""
        }
        ${celebrate ? "animate-celebrate" : ""}
      `}
    >
      {/* Subtle gradient glow */}
      <div
        className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${ghost ? "from-brand-500/5 to-transparent" : resolvedConfig.glowClass} opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`}
      />

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
            <p className="font-medium mb-1">
              Replaces: {swapInfo.replacedLabel}
            </p>
            <p className="text-surface-300">{swapInfo.restoreHint}</p>
          </div>
        </div>
      )}

      <div className="relative z-10 flex-1 flex flex-col justify-between">
        {/* Header: icon + label */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div
              className={
                ghost ? "text-surface-400" : resolvedConfig.accentColor
              }
            >
              <Icon className="h-4 w-4" strokeWidth={2} />
            </div>
            <span
              className={`text-xs font-medium uppercase tracking-wider ${ghost ? "text-surface-400" : "text-surface-400"}`}
            >
              {label}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {!ghost && sparkData && sparkData.length >= 2 && (
              <div className="hidden sm:block">
                <Sparkline
                  data={sparkData}
                  color={directionalSparkColor}
                />
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

            {/* Change row + description sub-line. Description renders on its own
                line beneath the change (not gated on `!change`), so a card can
                show both its MoM % and a clarifying sub-label (e.g. MRR's
                "ARR … · …% of revenue"). */}
            <div className="flex flex-col gap-0.5">
              {(change || changeLabel) && (
                <div className="flex items-center gap-2 flex-wrap">
                  {change && (
                    <span className={`text-xs font-semibold ${changeColor}`}>
                      {change}
                    </span>
                  )}
                  {changeLabel && (
                    <span className="text-xs text-surface-400">{changeLabel}</span>
                  )}
                </div>
              )}
              {description && (
                <span className="text-xs text-surface-400">{description}</span>
              )}
            </div>
          </>
        )}
      </div>
    </WidgetCard>
  );
}
