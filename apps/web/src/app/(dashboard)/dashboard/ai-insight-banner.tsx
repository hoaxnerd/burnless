"use client";

import { AlertTriangle, TrendingUp, ArrowRight } from "lucide-react";
import Link from "next/link";

interface AiInsightBannerProps {
  runway: number;
  burnRate: number;
  mrrGrowth: number;
  cash: number;
}

export function AiInsightBanner({ runway, burnRate, mrrGrowth, cash }: AiInsightBannerProps) {
  // Generate contextual insight based on current financials
  const insight = generateInsight(runway, burnRate, mrrGrowth, cash);
  if (!insight) return null;

  const borderColor = insight.severity === "critical"
    ? "border-red-300 bg-red-50"
    : insight.severity === "warning"
    ? "border-amber-300 bg-amber-50"
    : "border-brand-200 bg-brand-50";

  const iconColor = insight.severity === "critical"
    ? "text-red-500"
    : insight.severity === "warning"
    ? "text-amber-500"
    : "text-brand-600";

  const Icon = insight.severity === "critical" || insight.severity === "warning"
    ? AlertTriangle
    : TrendingUp;

  return (
    <div className={`rounded-xl border ${borderColor} p-4 mb-6`}>
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 flex-shrink-0 mt-0.5 ${iconColor}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-surface-900">{insight.title}</p>
          <p className="text-xs text-surface-600 mt-0.5">{insight.message}</p>
        </div>
        <Link
          href="/ai"
          className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          Explore <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

function generateInsight(
  runway: number,
  burnRate: number,
  mrrGrowth: number,
  cash: number
): { title: string; message: string; severity: "critical" | "warning" | "info" } | null {
  if (runway <= 3 && runway > 0) {
    return {
      title: `Critical: ${Math.round(runway)} months of runway remaining`,
      message: `At $${(burnRate / 1000).toFixed(0)}k/mo burn rate, you need to either reduce costs or raise capital immediately.`,
      severity: "critical",
    };
  }
  if (runway <= 6 && runway > 0) {
    return {
      title: `Runway at ${Math.round(runway)} months`,
      message: `Consider starting fundraising conversations now. At current burn, cash will be depleted by ${getExhaustionDate(runway)}.`,
      severity: "warning",
    };
  }
  if (mrrGrowth > 5) {
    return {
      title: `Revenue growing ${mrrGrowth.toFixed(1)}% month-over-month`,
      message: `Strong growth trajectory. At this rate, you're on track for significant ARR milestones.`,
      severity: "info",
    };
  }
  if (burnRate > 0 && cash > 0) {
    return {
      title: `${Math.round(runway)} months of runway at $${(burnRate / 1000).toFixed(0)}k/mo burn`,
      message: `Your financial position is stable. Focus on growth and efficiency.`,
      severity: "info",
    };
  }
  return null;
}

function getExhaustionDate(months: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() + Math.round(months));
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}
