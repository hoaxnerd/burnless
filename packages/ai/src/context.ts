/**
 * Financial context assembler — builds a structured summary of a company's
 * financial state for inclusion in AI prompts. Prioritizes the most relevant
 * data within token limits.
 */

import {
  type ComputedMetrics,
  type MonthlySeries,
  type ProfitAndLoss,
  seriesToArray,
} from "@burnless/engine";
import type { FinancialSnapshot } from "./types";

interface ContextInput {
  company: {
    name: string;
    stage: string;
    businessModel: string;
    industry: string | null;
    currency: string;
  };
  scenario: {
    id: string;
    name: string;
    type: string;
  };
  scenarios: Array<{ id: string; name: string; type: string; isDefault: boolean }>;
  accounts: Array<{ id: string; name: string; type: string; category: string }>;
  departments: Array<{ id: string; name: string }>;
  period: {
    start: string;
    end: string;
    currentMonth: string;
  };
  metrics: ComputedMetrics;
  totalRevenue: MonthlySeries;
  totalExpenses: MonthlySeries;
  cashPosition: MonthlySeries;
  headcountSeries: MonthlySeries;
  profitAndLoss: ProfitAndLoss;
  fundingRounds: Array<{
    name: string;
    type: string;
    amount: number;
    date: string;
    isProjected: boolean;
  }>;
}

/** Get the latest value from a MetricValue array. */
function latestMetricValue(values: Array<{ month: string; value: number }> | undefined): number | null {
  if (!values || values.length === 0) return null;
  return values[values.length - 1]!.value;
}

/** Sum all values in a StatementLineItem's values array. */
function sumLineItem(values: Array<{ month: string; value: number }> | undefined): number {
  if (!values || values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v.value, 0);
}

/** Build the financial snapshot for AI context. */
export function buildFinancialSnapshot(input: ContextInput): FinancialSnapshot {
  const { metrics, profitAndLoss } = input;

  return {
    company: input.company,
    scenario: input.scenario,
    period: input.period,
    keyMetrics: {
      mrr: latestMetricValue(metrics.mrr),
      arr: latestMetricValue(metrics.arr),
      burnRate: latestMetricValue(metrics.burnRate),
      netBurn: latestMetricValue(metrics.netBurnRate),
      runway: latestMetricValue(metrics.cashRunwayMonths),
      cashPosition: latestMetricValue(metrics.cashPosition),
      revenueGrowth: latestMetricValue(metrics.revenueGrowthRate),
      grossMargin: latestMetricValue(metrics.grossMarginPercent),
      headcount: latestMetricValue(metrics.revenuePerEmployee) !== null ? null : null, // Headcount comes from the series
      ltv: latestMetricValue(metrics.ltv),
      cac: latestMetricValue(metrics.cac),
      ltvCacRatio: latestMetricValue(metrics.ltvCacRatio),
      churnRate: latestMetricValue(metrics.customerChurnRate),
    },
    revenueByMonth: seriesToArray(input.totalRevenue).map((v) => ({ month: v.month, amount: v.value })),
    expensesByMonth: seriesToArray(input.totalExpenses).map((v) => ({ month: v.month, amount: v.value })),
    cashByMonth: seriesToArray(input.cashPosition).map((v) => ({ month: v.month, amount: v.value })),
    headcountByMonth: seriesToArray(input.headcountSeries).map((v) => ({ month: v.month, count: v.value })),
    profitAndLoss: {
      totalRevenue: sumLineItem(profitAndLoss.revenue.values),
      totalCogs: sumLineItem(profitAndLoss.cogs.values),
      grossProfit: sumLineItem(profitAndLoss.grossProfit.values),
      totalOpex: sumLineItem(profitAndLoss.operatingExpenses.values),
      netIncome: sumLineItem(profitAndLoss.netIncome.values),
    },
    fundingRounds: input.fundingRounds,
    scenarios: input.scenarios,
    accounts: input.accounts,
    departments: input.departments,
  };
}

/** Format the financial snapshot into a concise system prompt. */
export function formatContextForPrompt(snapshot: FinancialSnapshot): string {
  const { company, keyMetrics, period } = snapshot;
  const currency = company.currency || "USD";

  const fmt = (val: number | null, decimals = 0) => {
    if (val === null) return "N/A";
    return val.toLocaleString("en-US", { maximumFractionDigits: decimals });
  };
  const fmtPct = (val: number | null) => {
    if (val === null) return "N/A";
    return `${(val * 100).toFixed(1)}%`;
  };

  const lines = [
    `# Financial Context for ${company.name}`,
    ``,
    `**Company:** ${company.name} | Stage: ${company.stage} | Model: ${company.businessModel}${company.industry ? ` | Industry: ${company.industry}` : ""}`,
    `**Scenario:** ${snapshot.scenario.name} (${snapshot.scenario.type})`,
    `**Period:** ${period.start} to ${period.end} | Current month: ${period.currentMonth}`,
    `**Currency:** ${currency}`,
    ``,
    `## Key Metrics (Latest Month)`,
    `- MRR: ${currency} ${fmt(keyMetrics.mrr)}`,
    `- ARR: ${currency} ${fmt(keyMetrics.arr)}`,
    `- Cash Position: ${currency} ${fmt(keyMetrics.cashPosition)}`,
    `- Monthly Burn Rate: ${currency} ${fmt(keyMetrics.burnRate)}`,
    `- Net Burn: ${currency} ${fmt(keyMetrics.netBurn)}`,
    `- Runway: ${keyMetrics.runway !== null ? `${fmt(keyMetrics.runway, 1)} months` : "N/A"}`,
    `- Revenue Growth: ${fmtPct(keyMetrics.revenueGrowth)}`,
    `- Gross Margin: ${fmtPct(keyMetrics.grossMargin)}`,
    `- Headcount: ${fmt(keyMetrics.headcount)}`,
    `- LTV: ${currency} ${fmt(keyMetrics.ltv)}`,
    `- CAC: ${currency} ${fmt(keyMetrics.cac)}`,
    `- LTV:CAC Ratio: ${keyMetrics.ltvCacRatio !== null ? fmt(keyMetrics.ltvCacRatio, 1) + "x" : "N/A"}`,
    `- Churn Rate: ${fmtPct(keyMetrics.churnRate)}`,
    ``,
    `## P&L Summary (Period Total)`,
    `- Total Revenue: ${currency} ${fmt(snapshot.profitAndLoss.totalRevenue)}`,
    `- COGS: ${currency} ${fmt(snapshot.profitAndLoss.totalCogs)}`,
    `- Gross Profit: ${currency} ${fmt(snapshot.profitAndLoss.grossProfit)}`,
    `- OpEx: ${currency} ${fmt(snapshot.profitAndLoss.totalOpex)}`,
    `- Net Income: ${currency} ${fmt(snapshot.profitAndLoss.netIncome)}`,
  ];

  // Monthly trends (last 6 months or available)
  const recentRevenue = snapshot.revenueByMonth.slice(-6);
  if (recentRevenue.length > 0) {
    lines.push(``);
    lines.push(`## Monthly Revenue Trend`);
    for (const { month, amount } of recentRevenue) {
      lines.push(`- ${month}: ${currency} ${fmt(amount)}`);
    }
  }

  const recentCash = snapshot.cashByMonth.slice(-6);
  if (recentCash.length > 0) {
    lines.push(``);
    lines.push(`## Monthly Cash Position`);
    for (const { month, amount } of recentCash) {
      lines.push(`- ${month}: ${currency} ${fmt(amount)}`);
    }
  }

  // Funding
  if (snapshot.fundingRounds.length > 0) {
    lines.push(``);
    lines.push(`## Funding Rounds`);
    for (const round of snapshot.fundingRounds) {
      lines.push(`- ${round.name} (${round.type}): ${currency} ${fmt(round.amount)} on ${round.date}${round.isProjected ? " [projected]" : ""}`);
    }
  }

  // Available scenarios
  if (snapshot.scenarios.length > 1) {
    lines.push(``);
    lines.push(`## Available Scenarios`);
    for (const s of snapshot.scenarios) {
      lines.push(`- ${s.name} (${s.type})${s.isDefault ? " [default]" : ""} — ID: ${s.id}`);
    }
  }

  // Accounts
  if (snapshot.accounts.length > 0) {
    lines.push(``);
    lines.push(`## Chart of Accounts`);
    for (const a of snapshot.accounts) {
      lines.push(`- ${a.name} (${a.category}) — ID: ${a.id}`);
    }
  }

  // Departments
  if (snapshot.departments.length > 0) {
    lines.push(``);
    lines.push(`## Departments`);
    for (const d of snapshot.departments) {
      lines.push(`- ${d.name} — ID: ${d.id}`);
    }
  }

  return lines.join("\n");
}
