"use client";

import { TrendingDown, AlertTriangle, RotateCw, ArrowRight } from "lucide-react";
import Link from "next/link";
import { ratioToPct, pctOfTotal, dSum } from "@burnless/engine";
import { formatPercent } from "@burnless/types";
import { AiGate } from "@/components/ai/ai-gate";
import { formatCompactCurrency } from "@/components/charts";
import type { SubcategoryBreakdown, ExpenseLineItem } from "@/lib/compute-expenses";

interface ExpenseInsightsProps {
  breakdown: SubcategoryBreakdown[];
  lineItems: ExpenseLineItem[];
  totalMonthly: number;
  anomalyCount: number;
  recurringCount: number;
}

function generateInsights(
  breakdown: SubcategoryBreakdown[],
  lineItems: ExpenseLineItem[],
  totalMonthly: number,
): InsightItem[] {
  const insights: InsightItem[] = [];

  // Anomaly insights
  const anomalies = lineItems.filter((i) => i.isAnomaly);
  if (anomalies.length > 0) {
    const worst = anomalies.sort((a, b) => b.changePercent - a.changePercent)[0]!;
    insights.push({
      type: "warning",
      title: `${anomalies.length} expense${anomalies.length > 1 ? "s" : ""} spiked this month`,
      message: `${worst.accountName} increased ${formatPercent(ratioToPct(worst.changePercent), undefined, 0)} MoM — from ${formatCompactCurrency(worst.prevAmount)} to ${formatCompactCurrency(worst.currentAmount)}. Review for unexpected charges.`,
      icon: "alert",
    });
  }

  // Largest category insight
  if (breakdown.length > 0) {
    const largest = breakdown[0]!;
    insights.push({
      type: "info",
      title: `${largest.subcategory} is your #1 spend category`,
      message: `At ${formatCompactCurrency(largest.amount)}/mo (${formatPercent(largest.percentage, undefined, 0)} of total), this is your largest expense bucket. ${
        largest.changePercent > 0.05
          ? `It grew ${formatPercent(ratioToPct(largest.changePercent), undefined, 0)} from last month.`
          : largest.changePercent < -0.05
            ? `Good news — it decreased ${formatPercent(Math.abs(ratioToPct(largest.changePercent)), undefined, 0)} from last month.`
            : "It's been stable month-over-month."
      }`,
      icon: "trend",
    });
  }

  // Recurring expense summary
  const recurringItems = lineItems.filter((i) => i.isRecurring);
  const recurringTotal = dSum(recurringItems.map((i) => i.currentAmount));
  if (recurringItems.length >= 2) {
    const pct = totalMonthly > 0 ? formatPercent(pctOfTotal(recurringTotal, totalMonthly), undefined, 0) : formatPercent(0, undefined, 0);
    insights.push({
      type: "neutral",
      title: `${recurringItems.length} recurring expenses totaling ${formatCompactCurrency(recurringTotal)}/mo`,
      message: `Fixed costs make up ${pct} of your monthly spend. Predictable burn is good for forecasting. Consider negotiating annual contracts for potential savings.`,
      icon: "recurring",
    });
  }

  // Cost optimization opportunity
  const softwareSpend = breakdown.find((b) => b.subcategory === "Software & Tools");
  if (softwareSpend && softwareSpend.percentage > 15) {
    insights.push({
      type: "info",
      title: "Software spend above typical benchmarks",
      message: `At ${formatPercent(softwareSpend.percentage, undefined, 0)} of total expenses, your software costs are above the 10-15% benchmark for seed-stage startups. Review for unused or overlapping tools.`,
      icon: "trend",
    });
  }

  return insights.slice(0, 3); // Max 3 insights
}

interface InsightItem {
  type: "warning" | "info" | "neutral";
  title: string;
  message: string;
  icon: "alert" | "trend" | "recurring";
}

const iconMap = {
  alert: AlertTriangle,
  trend: TrendingDown,
  recurring: RotateCw,
} as const;

const styleMap = {
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

function StaticInsights({ breakdown, lineItems, totalMonthly }: Omit<ExpenseInsightsProps, "anomalyCount" | "recurringCount">) {
  const insights = generateInsights(breakdown, lineItems, totalMonthly);
  if (insights.length === 0) return null;

  return (
    <div className="space-y-3">
      {insights.map((insight, i) => (
        <InsightCard key={i} insight={insight} />
      ))}
    </div>
  );
}

function AiInsights({ breakdown, lineItems, totalMonthly }: Omit<ExpenseInsightsProps, "anomalyCount" | "recurringCount">) {
  const insights = generateInsights(breakdown, lineItems, totalMonthly);
  if (insights.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Header — these are deterministic/data-driven insights, not LLM-generated */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingDown className="h-3.5 w-3.5 text-surface-400" />
          <span className="text-[10px] font-medium uppercase tracking-widest text-surface-400">
            Expense Insights
          </span>
        </div>
        <Link
          href="/ai"
          className="inline-flex items-center gap-1 text-[10px] font-medium text-brand-600 hover:text-brand-700 transition-colors"
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

export function ExpenseInsights({
  breakdown,
  lineItems,
  totalMonthly,
}: ExpenseInsightsProps) {
  if (lineItems.length === 0) return null;

  return (
    <AiGate feature="insights" hideWhenOff>
      <AiInsights breakdown={breakdown} lineItems={lineItems} totalMonthly={totalMonthly} />
    </AiGate>
  );
}
