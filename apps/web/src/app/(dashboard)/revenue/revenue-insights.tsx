"use client";

import { TrendingUp, TrendingDown, AlertTriangle, ArrowRight, Zap } from "lucide-react";
import Link from "next/link";
import { AiGate } from "@/components/ai/ai-gate";
import { formatCompactCurrency } from "@/components/charts";
import type { GrowthMetrics, StreamBreakdown } from "@/lib/compute-revenue";

interface RevenueInsightsProps {
  growthMetrics: GrowthMetrics;
  streams: StreamBreakdown[];
  hasSaaS: boolean;
}

interface InsightItem {
  type: "success" | "warning" | "info" | "neutral";
  title: string;
  message: string;
  icon: "growth" | "decline" | "alert" | "zap";
}

function generateInsights(g: GrowthMetrics, streams: StreamBreakdown[], hasSaaS: boolean): InsightItem[] {
  const insights: InsightItem[] = [];

  // Growth trajectory
  if (g.mrrGrowthPercent > 15) {
    insights.push({
      type: "success",
      title: `Exceptional ${g.mrrGrowthPercent.toFixed(1)}% MoM MRR growth`,
      message: `At this rate, you'll double revenue in ${g.doublingTimeMonths ? Math.ceil(g.doublingTimeMonths) : "?"} months. This puts you in the top decile for early-stage SaaS.`,
      icon: "growth",
    });
  } else if (g.mrrGrowthPercent > 5) {
    insights.push({
      type: "info",
      title: `Healthy ${g.mrrGrowthPercent.toFixed(1)}% MoM growth`,
      message: `Solid trajectory. ${g.doublingTimeMonths ? `Revenue doubling time: ${Math.ceil(g.doublingTimeMonths)} months.` : ""} Above the 3-5% benchmark for post-seed startups.`,
      icon: "growth",
    });
  } else if (g.mrrGrowthPercent < 0) {
    insights.push({
      type: "warning",
      title: `Revenue declined ${Math.abs(g.mrrGrowthPercent).toFixed(1)}% this month`,
      message: `MRR dropped from ${formatCompactCurrency(g.prevMrr)} to ${formatCompactCurrency(g.currentMrr)}. Investigate churn drivers and customer feedback.`,
      icon: "decline",
    });
  }

  // Churn alert
  if (hasSaaS && g.churnRate > 5) {
    insights.push({
      type: "warning",
      title: `Churn rate at ${g.churnRate.toFixed(1)}% — above healthy threshold`,
      message: `Best-in-class SaaS targets <3% monthly churn. At ${g.churnRate.toFixed(1)}%, you're losing significant revenue. Focus on retention.`,
      icon: "alert",
    });
  } else if (hasSaaS && g.churnRate > 0 && g.churnRate <= 2) {
    insights.push({
      type: "success",
      title: `Strong retention — ${g.churnRate.toFixed(1)}% monthly churn`,
      message: `Below the 3% benchmark. Your LTV of ${formatCompactCurrency(g.ltv)} and ARPA of ${formatCompactCurrency(g.arpa)}/mo indicate healthy unit economics.`,
      icon: "zap",
    });
  }

  // Quick ratio (SaaS health)
  if (hasSaaS && g.quickRatio > 0) {
    if (g.quickRatio >= 4) {
      insights.push({
        type: "success",
        title: `SaaS Quick Ratio of ${g.quickRatio.toFixed(1)} — excellent efficiency`,
        message: "A ratio above 4 means you're growing efficiently. New + expansion revenue far outpaces churn.",
        icon: "zap",
      });
    } else if (g.quickRatio < 1) {
      insights.push({
        type: "warning",
        title: `SaaS Quick Ratio below 1 — shrinking`,
        message: `At ${g.quickRatio.toFixed(1)}, churn exceeds new revenue. This is unsustainable — prioritize retention.`,
        icon: "alert",
      });
    }
  }

  // Revenue concentration risk
  if (streams.length > 1) {
    const topStream = streams[0];
    if (topStream && topStream.percentage > 80) {
      insights.push({
        type: "info",
        title: `${topStream.percentage.toFixed(0)}% revenue from "${topStream.name}"`,
        message: "High concentration in a single stream. Consider diversifying revenue sources to reduce risk.",
        icon: "alert",
      });
    }
  }

  return insights.slice(0, 3);
}

const iconMap = {
  growth: TrendingUp,
  decline: TrendingDown,
  alert: AlertTriangle,
  zap: Zap,
} as const;

const styleMap = {
  success: {
    border: "border-green-200",
    bg: "bg-green-50/50",
    iconBg: "bg-green-100",
    iconColor: "text-green-600",
  },
  warning: {
    border: "border-warning-200",
    bg: "bg-warning-50/50",
    iconBg: "bg-warning-100",
    iconColor: "text-warning-600",
  },
  info: {
    border: "border-brand-200",
    bg: "bg-brand-50/30",
    iconBg: "bg-brand-100",
    iconColor: "text-brand-600",
  },
  neutral: {
    border: "border-surface-200",
    bg: "bg-surface-50/50",
    iconBg: "bg-surface-100",
    iconColor: "text-surface-600",
  },
} as const;

function InsightCard({ insight }: { insight: InsightItem }) {
  const styles = styleMap[insight.type];
  const Icon = iconMap[insight.icon];

  return (
    <div className={`rounded-xl border ${styles.border} ${styles.bg} p-4 transition-shadow hover:shadow-sm`}>
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 rounded-lg p-1.5 ${styles.iconBg}`}>
          <Icon className={`h-3.5 w-3.5 ${styles.iconColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-surface-900 leading-snug">{insight.title}</p>
          <p className="text-xs text-surface-500 mt-1 leading-relaxed">{insight.message}</p>
        </div>
      </div>
    </div>
  );
}

function InsightsList({ growthMetrics, streams, hasSaaS }: RevenueInsightsProps) {
  const insights = generateInsights(growthMetrics, streams, hasSaaS);
  if (insights.length === 0) return null;

  return (
    <div className="space-y-3">
      {insights.map((insight, i) => (
        <InsightCard key={i} insight={insight} />
      ))}
    </div>
  );
}

function AiInsightsList({ growthMetrics, streams, hasSaaS }: RevenueInsightsProps) {
  const insights = generateInsights(growthMetrics, streams, hasSaaS);
  if (insights.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Header — these are deterministic/data-driven insights, not LLM-generated */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-3.5 w-3.5 text-surface-400" />
          <span className="text-[10px] font-medium uppercase tracking-widest text-surface-400">
            Revenue Insights
          </span>
        </div>
        <Link
          href="/ai"
          className="inline-flex items-center gap-1 text-[10px] font-medium text-accent-600 hover:text-accent-700 transition-colors"
        >
          Deep analysis <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {insights.map((insight, i) => (
        <InsightCard key={i} insight={insight} />
      ))}
    </div>
  );
}

export function RevenueInsights({ growthMetrics, streams, hasSaaS }: RevenueInsightsProps) {
  if (streams.length === 0) return null;

  return (
    <AiGate feature="insights" hideWhenOff>
      <AiInsightsList growthMetrics={growthMetrics} streams={streams} hasSaaS={hasSaaS} />
    </AiGate>
  );
}
