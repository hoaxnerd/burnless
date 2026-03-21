"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Wallet,
  Flame,
  Clock,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

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

  useEffect(() => {
    if (prevRef.current !== value) {
      prevRef.current = value;
      setDisplayed(value);
    }
  }, [value]);

  return (
    <span className="display-number tabular-nums transition-all duration-300">
      {displayed}
    </span>
  );
}

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
    accentColor: "text-violet-500",
    sparkColor: "#8b5cf6",
    glowClass: "from-violet-500/5 to-transparent",
    href: "/revenue",
  },
};

interface HeroKpiCardProps {
  variant: KpiVariant;
  label: string;
  value: string;
  change?: string;
  changeLabel?: string;
  description?: string;
  sparkData?: number[];
  /** Animation stagger index (0-based) */
  stagger?: number;
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
}: HeroKpiCardProps & { celebrate?: boolean }) {
  const config = variantConfig[variant];
  const Icon = config.icon;
  const router = useRouter();
  const ghost = isGhost(value);

  const isPositive = change?.startsWith("+");
  const isNegative = change?.startsWith("-");
  // For burn, positive change is bad (increasing burn)
  const changeColor =
    variant === "burn"
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
    <div
      role="link"
      tabIndex={0}
      onClick={() => router.push(config.href)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") router.push(config.href); }}
      className={`
        group relative overflow-hidden cursor-pointer
        rounded-2xl border
        p-5 sm:p-6
        transition-all duration-300
        animate-slide-up stagger-${stagger + 1}
        ${ghost
          ? "bg-surface-50/50 border-dashed border-surface-200/70 hover:border-surface-300"
          : "bg-surface-0 border-surface-200 hover:border-surface-300 hover:shadow-lg"
        }
        ${celebrate ? "animate-celebrate" : ""}
      `}
    >
      {/* Subtle gradient glow — only on populated cards */}
      {!ghost && (
        <div
          className={`absolute inset-0 bg-gradient-to-br ${config.glowClass} opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`}
        />
      )}

      <div className="relative z-10">
        {/* Header: icon + label */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={ghost ? "text-surface-300" : config.accentColor}>
              <Icon className="h-4 w-4" strokeWidth={2} />
            </div>
            <span className={`text-xs font-medium uppercase tracking-wider ${ghost ? "text-surface-300" : "text-surface-400"}`}>
              {label}
            </span>
          </div>
          {!ghost && sparkData && sparkData.length >= 2 && (
            <Sparkline data={sparkData} color={config.sparkColor} />
          )}
        </div>

        {/* Value */}
        <div className={`text-2xl sm:text-3xl font-bold leading-none mb-2 ${ghost ? "text-surface-300" : "text-surface-900"}`}>
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
            <span className={`text-xs ${ghost ? "text-surface-300" : "text-surface-400"}`}>{description}</span>
          )}
        </div>
      </div>
    </div>
  );
}
