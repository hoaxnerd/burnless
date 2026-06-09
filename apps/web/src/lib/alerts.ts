/**
 * Proactive financial alerts engine.
 * Analyzes metric data and surfaces actionable insights without user prompting.
 */

import { pctChange } from "@burnless/engine";
import { formatCompactAmount, formatPercent, type CurrencyCode } from "@burnless/types";

export type AlertSeverity = "critical" | "warning" | "info" | "celebration";

export interface FinancialAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  metric?: string;
  value?: number;
}

interface MetricPoint {
  month: string;
  value: number;
}

interface AlertInput {
  cashRunway: MetricPoint[];
  netBurnRate: MetricPoint[];
  mrr: MetricPoint[];
  cashPosition: MetricPoint[];
  currentMonth: string;
  currency?: CurrencyCode;
  locale?: string;
}

/**
 * Generate proactive alerts from financial metrics.
 * Called server-side when computing dashboard data.
 */
export function generateAlerts(data: AlertInput): FinancialAlert[] {
  const alerts: FinancialAlert[] = [];
  const currency = data.currency ?? "USD";
  const locale = data.locale;
  const fmt = (v: number) => formatCompactAmount(v, currency, locale);
  const current = (series: MetricPoint[]) =>
    series.find((m) => m.month === data.currentMonth)?.value ?? 0;
  const previous = (series: MetricPoint[]) => {
    const idx = series.findIndex((m) => m.month === data.currentMonth);
    return idx > 0 ? series[idx - 1]!.value : 0;
  };

  const runway = current(data.cashRunway);
  const burn = current(data.netBurnRate);
  const prevBurn = previous(data.netBurnRate);
  const mrr = current(data.mrr);
  const prevMrr = previous(data.mrr);
  const _cash = current(data.cashPosition);

  // ── Critical: Runway below 3 months ────────────────────────────────
  if (runway > 0 && runway < 3) {
    alerts.push({
      id: "runway-critical",
      severity: "critical",
      title: "Runway critically low",
      message: `Only ${Math.round(runway)} months of runway remaining at current burn rate. Immediate action required — cut costs or accelerate fundraising.`,
      metric: "runway",
      value: runway,
    });
  }

  // ── Warning: Runway below 6 months ─────────────────────────────────
  if (runway >= 3 && runway < 6) {
    alerts.push({
      id: "runway-warning",
      severity: "warning",
      title: "Runway getting short",
      message: `${Math.round(runway)} months of runway. Most fundraises take 3-6 months — start conversations with investors soon.`,
      metric: "runway",
      value: runway,
    });
  }

  // ── Warning: Burn rate accelerating ────────────────────────────────
  if (prevBurn > 0 && burn > 0) {
    const burnChange = pctChange(burn, prevBurn) ?? 0;
    if (burnChange > 15) {
      alerts.push({
        id: "burn-accelerating",
        severity: "warning",
        title: "Burn rate accelerating",
        message: `Burn rate increased ${formatPercent(burnChange, undefined, 0)} month-over-month (${fmt(prevBurn)} → ${fmt(burn)}). Review recent expenses for unexpected increases.`,
        metric: "burn_rate",
        value: burnChange,
      });
    }
  }

  // ── Warning: MRR declining ─────────────────────────────────────────
  if (prevMrr > 0 && mrr < prevMrr) {
    const mrrDecline = -(pctChange(mrr, prevMrr) ?? 0);
    if (mrrDecline > 5) {
      alerts.push({
        id: "mrr-declining",
        severity: "warning",
        title: "Revenue declining",
        message: `MRR dropped ${formatPercent(mrrDecline, undefined, 0)} (${fmt(prevMrr)} → ${fmt(mrr)}). Investigate churn and review your retention strategy.`,
        metric: "mrr",
        value: -mrrDecline,
      });
    }
  }

  // ── Info: Healthy runway ───────────────────────────────────────────
  if (runway >= 12 && runway < 999) {
    alerts.push({
      id: "runway-healthy",
      severity: "info",
      title: "Strong runway position",
      message: `${Math.round(runway)} months of runway gives you time to focus on growth over fundraising.`,
      metric: "runway",
      value: runway,
    });
  }

  // ── Celebration: MRR milestone ─────────────────────────────────────
  const mrrMilestones = [10_000, 50_000, 100_000, 500_000, 1_000_000];
  for (const milestone of mrrMilestones) {
    if (mrr >= milestone && prevMrr < milestone) {
      const label = fmt(milestone);
      alerts.push({
        id: `mrr-milestone-${milestone}`,
        severity: "celebration",
        title: `${label} MRR milestone!`,
        message: `You crossed ${label} in monthly recurring revenue. This is a significant achievement — celebrate with your team!`,
        metric: "mrr",
        value: mrr,
      });
      break; // Only show highest milestone crossed
    }
  }

  // ── Celebration: Burn rate improving ────────────────────────────────
  if (prevBurn > 0 && burn > 0 && burn < prevBurn) {
    const burnImprovement = -(pctChange(burn, prevBurn) ?? 0);
    if (burnImprovement > 10) {
      alerts.push({
        id: "burn-improving",
        severity: "celebration",
        title: "Burn rate improving",
        message: `Burn rate decreased ${formatPercent(burnImprovement, undefined, 0)} month-over-month. Keep up the efficient spending!`,
        metric: "burn_rate",
        value: -burnImprovement,
      });
    }
  }

  return alerts;
}
