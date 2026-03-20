/**
 * Automated insight generation — proactive analysis of financial data
 * without requiring user prompts.
 */

import type { FinancialSnapshot, Insight } from "./types";

/** Generate all applicable insights from the current financial snapshot. */
export function generateInsights(snapshot: FinancialSnapshot): Insight[] {
  const insights: Insight[] = [];

  // Runway alerts
  const runwayInsight = checkRunway(snapshot);
  if (runwayInsight) insights.push(runwayInsight);

  // Burn rate trend
  const burnInsight = checkBurnTrend(snapshot);
  if (burnInsight) insights.push(burnInsight);

  // Revenue growth
  const growthInsight = checkRevenueGrowth(snapshot);
  if (growthInsight) insights.push(growthInsight);

  // Unit economics
  const unitEconInsight = checkUnitEconomics(snapshot);
  if (unitEconInsight) insights.push(unitEconInsight);

  // Cash position
  const cashInsight = checkCashPosition(snapshot);
  if (cashInsight) insights.push(cashInsight);

  return insights;
}

function checkRunway(snapshot: FinancialSnapshot): Insight | null {
  const { runway } = snapshot.keyMetrics;
  if (runway === null) return null;

  if (runway <= 3) {
    return {
      type: "runway_alert",
      title: "Critical: Runway Below 3 Months",
      summary: `Your current runway is ${runway.toFixed(1)} months. Immediate action needed — you must either cut burn or secure funding.`,
      details: `At the current burn rate of ${snapshot.company.currency} ${snapshot.keyMetrics.burnRate?.toLocaleString() ?? "N/A"}/month with ${snapshot.company.currency} ${snapshot.keyMetrics.cashPosition?.toLocaleString() ?? "N/A"} in cash, you have approximately ${runway.toFixed(1)} months of runway remaining.\n\n**Recommended actions:**\n- Begin fundraising immediately (allow 3-6 months lead time)\n- Identify non-critical expenses that can be cut or deferred\n- Consider bridge financing or revenue acceleration`,
      severity: "critical",
      relatedMetrics: ["runway", "burnRate", "cashPosition"],
    };
  }

  if (runway <= 6) {
    return {
      type: "runway_alert",
      title: "Warning: Runway Below 6 Months",
      summary: `Your runway is ${runway.toFixed(1)} months. Start planning for your next funding round or path to profitability.`,
      details: `With ${runway.toFixed(1)} months of runway, you should be actively raising or have a clear path to reducing burn. Most fundraising processes take 3-6 months from first meeting to close.\n\n**Consider:**\n- Start fundraising conversations now\n- Model what burn rate gets you to 12+ months runway\n- Identify levers to extend runway (hiring freeze, vendor renegotiation)`,
      severity: "warning",
      relatedMetrics: ["runway", "burnRate", "cashPosition"],
    };
  }

  if (runway <= 12) {
    return {
      type: "runway_alert",
      title: "Runway Check: 12 Months or Less",
      summary: `You have ${runway.toFixed(1)} months of runway. Good time to start thinking about your fundraising strategy.`,
      details: `While not urgent, having less than 12 months of runway means you should begin preparing for fundraising. This includes getting your metrics in order, building investor relationships, and modeling different growth scenarios.`,
      severity: "info",
      relatedMetrics: ["runway", "burnRate", "cashPosition"],
    };
  }

  return null;
}

function checkBurnTrend(snapshot: FinancialSnapshot): Insight | null {
  const expenses = snapshot.expensesByMonth;
  if (expenses.length < 3) return null;

  const recent = expenses.slice(-3);
  const firstMonth = recent[0]!.amount;
  const lastMonth = recent[recent.length - 1]!.amount;

  if (firstMonth === 0) return null;
  const growthRate = (lastMonth - firstMonth) / firstMonth;

  if (growthRate > 0.2) {
    return {
      type: "variance_analysis",
      title: "Expenses Growing Rapidly",
      summary: `Expenses increased ${(growthRate * 100).toFixed(0)}% over the last 3 months (${snapshot.company.currency} ${firstMonth.toLocaleString()} → ${snapshot.company.currency} ${lastMonth.toLocaleString()}).`,
      details: `Your expenses are growing faster than typical. Review whether this is planned (e.g., hiring ramp) or if there are areas of unexpected cost increase. Consider whether revenue growth is keeping pace.`,
      severity: growthRate > 0.5 ? "warning" : "info",
      relatedMetrics: ["burnRate", "netBurn"],
    };
  }

  return null;
}

function checkRevenueGrowth(snapshot: FinancialSnapshot): Insight | null {
  const revenue = snapshot.revenueByMonth;
  if (revenue.length < 2) return null;

  const recent = revenue.slice(-3);
  const lastMonth = recent[recent.length - 1]!.amount;
  const prevMonth = recent.length >= 2 ? recent[recent.length - 2]!.amount : 0;

  if (prevMonth === 0 && lastMonth > 0) {
    return {
      type: "financial_narrative",
      title: "Revenue Started",
      summary: `You've begun generating revenue at ${snapshot.company.currency} ${lastMonth.toLocaleString()}/month.`,
      details: `Congratulations on generating your first revenue! Focus on understanding your unit economics — what does it cost to acquire a customer, and what's their lifetime value?`,
      severity: "info",
      relatedMetrics: ["mrr", "revenueGrowthPercent"],
    };
  }

  if (prevMonth > 0) {
    const growth = (lastMonth - prevMonth) / prevMonth;
    if (growth < -0.1) {
      return {
        type: "variance_analysis",
        title: "Revenue Declining",
        summary: `Revenue dropped ${(Math.abs(growth) * 100).toFixed(0)}% month-over-month (${snapshot.company.currency} ${prevMonth.toLocaleString()} → ${snapshot.company.currency} ${lastMonth.toLocaleString()}).`,
        details: `Investigate the cause — is this churn, seasonal effects, or lost deals? Check churn rate and customer retention metrics. If this is a trend, model what it means for your runway.`,
        severity: growth < -0.2 ? "warning" : "info",
        relatedMetrics: ["mrr", "revenueGrowthPercent", "churnRate"],
      };
    }
  }

  return null;
}

function checkUnitEconomics(snapshot: FinancialSnapshot): Insight | null {
  const { ltvCacRatio, ltv, cac } = snapshot.keyMetrics;

  if (ltvCacRatio !== null && ltvCacRatio < 3 && ltvCacRatio > 0) {
    return {
      type: "benchmark",
      title: "LTV:CAC Ratio Below Benchmark",
      summary: `Your LTV:CAC ratio is ${ltvCacRatio.toFixed(1)}x. The benchmark for healthy SaaS is 3x or higher.`,
      details: `With an LTV of ${snapshot.company.currency} ${ltv?.toLocaleString() ?? "N/A"} and CAC of ${snapshot.company.currency} ${cac?.toLocaleString() ?? "N/A"}, each customer isn't generating enough lifetime value relative to acquisition cost.\n\n**Options to improve:**\n- Increase retention (reduces churn, increases LTV)\n- Raise prices (directly increases LTV)\n- Optimize acquisition channels (reduces CAC)\n- Increase expansion revenue (upsells/cross-sells increase LTV)`,
      severity: ltvCacRatio < 1 ? "critical" : "warning",
      relatedMetrics: ["ltv", "cac", "ltvCacRatio", "churnRate"],
    };
  }

  return null;
}

function checkCashPosition(snapshot: FinancialSnapshot): Insight | null {
  const cash = snapshot.cashByMonth;
  if (cash.length < 2) return null;

  const lastMonth = cash[cash.length - 1]!.amount;
  if (lastMonth < 0) {
    return {
      type: "runway_alert",
      title: "Negative Cash Position Projected",
      summary: `Your model projects a negative cash position of ${snapshot.company.currency} ${lastMonth.toLocaleString()} — you'll run out of money before this date.`,
      details: `Your financial model shows cash going negative. This is a critical finding. You need to either secure additional funding or reduce expenses before this date.`,
      severity: "critical",
      relatedMetrics: ["cashPosition", "runway"],
    };
  }

  return null;
}
