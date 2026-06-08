import {
  GitBranch,
  FileBarChart,
  TrendingUp,
  ShieldAlert,
  Zap,
} from "lucide-react";
import { formatCompactAmount, formatPercent, type CurrencyCode } from "@burnless/types";

/* ── Types ─────────────────────────────────────────────────────────────────── */

export interface AiCommandCenterProps {
  runway: number;
  burnRate: number;
  mrr: number;
  mrrGrowth: number;
  cash: number;
}

export interface AlertData {
  id: string;
  severity: string;
  title: string;
  message: string;
}

export interface InsightItem {
  title: string;
  message: string;
  severity: "success" | "warning" | "info";
  icon: typeof TrendingUp;
}

export const severityStyles = {
  success: {
    border: "border-emerald-500/20",
    bg: "bg-emerald-50/50",
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-600",
    dot: "bg-emerald-500",
  },
  warning: {
    border: "border-warning-500/20",
    bg: "bg-warning-50/50",
    iconBg: "bg-warning-500/10",
    iconColor: "text-warning-600",
    dot: "bg-warning-500",
  },
  info: {
    border: "border-accent-500/15",
    bg: "bg-accent-50/30",
    iconBg: "bg-accent-500/10",
    iconColor: "text-accent-600",
    dot: "bg-accent-500",
  },
} as const;

/* ── Helpers ───────────────────────────────────────────────────────────────── */

export function generateInsights(
  runway: number,
  burnRate: number,
  mrr: number,
  mrrGrowth: number,
  cash: number,
  currency: CurrencyCode = "USD",
  locale?: string,
): InsightItem[] {
  const fmt = (v: number) => formatCompactAmount(v, currency, locale);
  const insights: InsightItem[] = [];

  if (runway > 0 && runway <= 6) {
    insights.push({
      title: "Runway Alert",
      message: `${Math.round(runway)} months remaining — time to act on fundraising or cost reduction.`,
      severity: "warning",
      icon: ShieldAlert,
    });
  } else if (runway > 0 && runway < 999) {
    insights.push({
      title: "Runway Healthy",
      message: `${Math.round(runway)} months of runway at current burn rate.`,
      severity: "success",
      icon: TrendingUp,
    });
  } else if (runway >= 999 && cash > 0) {
    insights.push({
      title: "Cash-Flow Positive",
      message: `${fmt(cash)} in the bank with positive cash flow.`,
      severity: "success",
      icon: TrendingUp,
    });
  }

  if (mrrGrowth > 10) {
    insights.push({
      title: "Exceptional Growth",
      message: `MRR grew ${formatPercent(mrrGrowth, undefined, 0)} this month — exceptional momentum.`,
      severity: "success",
      icon: Zap,
    });
  } else if (mrrGrowth > 5) {
    insights.push({
      title: "Strong MRR Growth",
      message: `MRR grew ${formatPercent(mrrGrowth, undefined, 0)} month-over-month — strong and steady.`,
      severity: "success",
      icon: TrendingUp,
    });
  } else if (mrrGrowth > 0 && mrr > 0) {
    insights.push({
      title: "MRR Trending Up",
      message: `MRR is up ${formatPercent(mrrGrowth)} month-over-month.`,
      severity: "info",
      icon: TrendingUp,
    });
  } else if (mrrGrowth < -5 && mrr > 0) {
    insights.push({
      title: "MRR Declining",
      message: `MRR declined ${formatPercent(Math.abs(mrrGrowth))} — worth investigating.`,
      severity: "warning",
      icon: ShieldAlert,
    });
  }

  if (burnRate > 0 && insights.length < 2) {
    insights.push({
      title: "Burn Rate",
      message: `Monthly burn is ${fmt(burnRate)} with ${fmt(cash)} cash on hand.`,
      severity: "info",
      icon: Zap,
    });
  }

  if (insights.length === 0) {
    insights.push({
      title: "Financial Snapshot",
      message: `${fmt(cash)} in cash with ${fmt(burnRate)}/mo burn.`,
      severity: "info",
      icon: TrendingUp,
    });
  }

  return insights;
}

/** Pick a contextual placeholder based on financial data. */
export function getPlaceholder(runway: number, mrr: number, burnRate: number): string {
  const placeholders = [
    "Ask about your runway, burn rate, or revenue...",
    "What should I focus on this month?",
    "How can I extend my runway?",
  ];

  if (runway > 0 && runway <= 6) {
    return "How can I extend my runway?";
  }
  if (mrr > 0) {
    return "What's driving my MRR growth?";
  }
  if (burnRate > 0) {
    return "Where can I cut costs without hurting growth?";
  }
  return placeholders[Math.floor(Date.now() / 60000) % placeholders.length]!;
}

/* ── Quick Action Cards ────────────────────────────────────────────────────── */

export const quickActions = [
  {
    id: "scenario",
    title: "Build Scenario",
    description: "Model a what-if projection",
    icon: GitBranch,
    gradientFrom: "from-violet-500",
    gradientTo: "to-fuchsia-500",
    glowColor: "group-hover:shadow-violet-500/25",
    href: "/scenarios/new",
  },
  {
    id: "report",
    title: "Generate Report",
    description: "One-click board deck",
    icon: FileBarChart,
    gradientFrom: "from-emerald-500",
    gradientTo: "to-teal-500",
    glowColor: "group-hover:shadow-emerald-500/25",
    href: "/reports",
  },
] as const;
