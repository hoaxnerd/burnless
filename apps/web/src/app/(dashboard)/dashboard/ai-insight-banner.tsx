"use client";

import { AlertTriangle, TrendingUp, ArrowRight, Sparkles, ShieldAlert, Info } from "lucide-react";
import Link from "next/link";
import { AiGate } from "@/components/ai/ai-gate";

interface AiInsightBannerProps {
  runway: number;
  burnRate: number;
  mrrGrowth: number;
  cash: number;
}

export function AiInsightBanner({ runway, burnRate, mrrGrowth, cash }: AiInsightBannerProps) {
  const insight = generateInsight(runway, burnRate, mrrGrowth, cash);
  if (!insight) return null;

  const styles = severityStyles[insight.severity];
  const Icon = styles.icon;

  return (
    <AiGate feature="insights" hideWhenOff>
    <div
      className={`
        relative overflow-hidden rounded-2xl border p-4 sm:p-5 mb-6
        ${styles.border} ${styles.bg}
        animate-slide-up
      `}
    >
      {/* Ambient glow — breathing animation */}
      <div
        className={`absolute inset-0 ${styles.glow} pointer-events-none`}
        style={{ animation: "ambientBreath 4s ease-in-out infinite" }}
      />

      <div className="relative flex items-start gap-3 sm:gap-4">
        {/* Icon badge with pulse ring */}
        <div className="relative flex-shrink-0">
          <div className={`absolute inset-0 rounded-xl ${styles.iconBg} animate-ping opacity-20`} />
          <div className={`relative rounded-xl p-2 ${styles.iconBg}`}>
            <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${styles.iconColor}`} />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <Sparkles className="h-3 w-3 text-brand-400 flex-shrink-0" />
            <span className="text-[10px] font-medium uppercase tracking-widest text-surface-400">
              AI Insight
            </span>
          </div>
          <p className="text-sm font-semibold text-surface-900 leading-snug">
            {insight.title}
          </p>
          <p className="text-xs text-surface-500 mt-1 leading-relaxed">
            {insight.message}
          </p>
        </div>

        {/* CTA */}
        <Link
          href="/ai"
          className={`
            flex-shrink-0 inline-flex items-center gap-1.5
            rounded-lg px-3 py-1.5 text-xs font-medium
            ${styles.ctaBg} ${styles.ctaText}
            hover:opacity-90 transition-opacity
          `}
        >
          Explore <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
    </AiGate>
  );
}

/* ── Severity visual config ───────────────────────────────────────────────── */

const severityStyles = {
  critical: {
    icon: ShieldAlert,
    border: "border-danger-500/30",
    bg: "bg-danger-50",
    glow: "bg-gradient-to-r from-danger-500/10 via-transparent to-transparent",
    iconBg: "bg-danger-500/10",
    iconColor: "text-danger-500",
    ctaBg: "bg-danger-500/10",
    ctaText: "text-danger-600",
  },
  warning: {
    icon: AlertTriangle,
    border: "border-warning-500/30",
    bg: "bg-warning-50",
    glow: "bg-gradient-to-r from-warning-500/10 via-transparent to-transparent",
    iconBg: "bg-warning-500/10",
    iconColor: "text-warning-500",
    ctaBg: "bg-warning-500/10",
    ctaText: "text-warning-600",
  },
  info: {
    icon: TrendingUp,
    border: "border-brand-500/20",
    bg: "bg-brand-50/50",
    glow: "bg-gradient-to-r from-brand-500/5 via-transparent to-transparent",
    iconBg: "bg-brand-500/10",
    iconColor: "text-brand-500",
    ctaBg: "bg-brand-500/10",
    ctaText: "text-brand-600",
  },
  neutral: {
    icon: Info,
    border: "border-surface-200",
    bg: "bg-surface-50",
    glow: "bg-gradient-to-r from-surface-500/5 via-transparent to-transparent",
    iconBg: "bg-surface-200",
    iconColor: "text-surface-500",
    ctaBg: "bg-surface-200",
    ctaText: "text-surface-600",
  },
} as const;

type Severity = keyof typeof severityStyles;

/* ── Insight generation ───────────────────────────────────────────────────── */

function generateInsight(
  runway: number,
  burnRate: number,
  mrrGrowth: number,
  cash: number,
): { title: string; message: string; severity: Severity } | null {
  if (runway <= 3 && runway > 0) {
    return {
      title: `${Math.round(runway)} months of runway remaining`,
      message: `At $${(burnRate / 1000).toFixed(0)}k/mo burn, you need to reduce costs or raise capital. Cash exhaustion projected by ${getExhaustionDate(runway)}.`,
      severity: "critical",
    };
  }
  if (runway <= 6 && runway > 0) {
    return {
      title: `Runway at ${Math.round(runway)} months — start fundraising conversations`,
      message: `At current burn rate, cash will be depleted by ${getExhaustionDate(runway)}. Typical fundraise takes 3-6 months.`,
      severity: "warning",
    };
  }
  if (mrrGrowth > 10) {
    return {
      title: `Revenue surging ${mrrGrowth.toFixed(1)}% month-over-month`,
      message: `Exceptional growth trajectory. At this rate, you'll double revenue in ${Math.ceil(72 / mrrGrowth)} months.`,
      severity: "info",
    };
  }
  if (mrrGrowth > 5) {
    return {
      title: `Healthy ${mrrGrowth.toFixed(1)}% MoM revenue growth`,
      message: `Strong and sustainable growth. You're in the top quartile for early-stage startups.`,
      severity: "info",
    };
  }
  if (burnRate > 0 && cash > 0 && runway >= 12) {
    return {
      title: `${Math.round(runway)} months of runway — solid position`,
      message: `With $${(cash / 1000).toFixed(0)}k in the bank at $${(burnRate / 1000).toFixed(0)}k/mo burn, you have room to focus on growth.`,
      severity: "neutral",
    };
  }
  if (burnRate > 0 && cash > 0) {
    return {
      title: `${Math.round(runway)} months runway at $${(burnRate / 1000).toFixed(0)}k/mo burn`,
      message: `Your financial position is stable. Focus on growth and efficiency.`,
      severity: "neutral",
    };
  }
  return null;
}

function getExhaustionDate(months: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() + Math.round(months));
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}
