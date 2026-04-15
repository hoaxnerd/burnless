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
import { formatCurrency, formatNumber, type CurrencyCode, isValidCurrency } from "@burnless/types";
import type { FinancialSnapshot } from "./types";

interface ContextInput {
  company: {
    name: string;
    stage: string;
    businessModel: string;
    industry: string | null;
    currency: string;
    locale?: string;
  };
  scenario: {
    id: string;
    name: string;
    source: string;
  };
  scenarios: Array<{ id: string; name: string; source: string; status: string }>;
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
  const currency = (isValidCurrency(company.currency) ? company.currency : "USD") as CurrencyCode;
  const locale = company.locale;

  const fmt = (val: number | null, decimals = 0) => {
    if (val === null) return "N/A";
    return formatNumber(val, locale, { decimals });
  };
  const fmtCur = (val: number | null) => {
    if (val === null) return "N/A";
    return formatCurrency(val, currency, locale);
  };
  const fmtPct = (val: number | null) => {
    if (val === null) return "N/A";
    // Engine metrics are already in percentage points (e.g. 4.0 = 4%), not decimals
    return `${val.toFixed(1)}%`;
  };

  const lines = [
    `# Financial Context for ${company.name}`,
    ``,
    `**Company:** ${company.name} | Stage: ${company.stage} | Model: ${company.businessModel}${company.industry ? ` | Industry: ${company.industry}` : ""}`,
    `**Scenario:** ${snapshot.scenario.name} (${snapshot.scenario.source})`,
    `**Period:** ${period.start} to ${period.end} | Current month: ${period.currentMonth}`,
    `**Currency:** ${currency}`,
    ``,
    `## Key Metrics (Latest Month)`,
    `- MRR: ${fmtCur(keyMetrics.mrr)}`,
    `- ARR: ${fmtCur(keyMetrics.arr)}`,
    `- Cash Position: ${fmtCur(keyMetrics.cashPosition)}`,
    `- Monthly Burn Rate: ${fmtCur(keyMetrics.burnRate)}`,
    `- Net Burn: ${fmtCur(keyMetrics.netBurn)}`,
    `- Runway: ${keyMetrics.runway !== null ? `${fmt(keyMetrics.runway, 1)} months` : "N/A"}`,
    `- Revenue Growth: ${fmtPct(keyMetrics.revenueGrowth)}`,
    `- Gross Margin: ${fmtPct(keyMetrics.grossMargin)}`,
    `- Headcount: ${fmt(keyMetrics.headcount)}`,
    `- LTV: ${fmtCur(keyMetrics.ltv)}`,
    `- CAC: ${fmtCur(keyMetrics.cac)}`,
    `- LTV:CAC Ratio: ${keyMetrics.ltvCacRatio !== null ? fmt(keyMetrics.ltvCacRatio, 1) + "x" : "N/A"}`,
    `- Churn Rate: ${fmtPct(keyMetrics.churnRate)}`,
    ``,
    `## P&L Summary (Period Total)`,
    `- Total Revenue: ${formatCurrency(snapshot.profitAndLoss.totalRevenue, currency, locale)}`,
    `- COGS: ${formatCurrency(snapshot.profitAndLoss.totalCogs, currency, locale)}`,
    `- Gross Profit: ${formatCurrency(snapshot.profitAndLoss.grossProfit, currency, locale)}`,
    `- OpEx: ${formatCurrency(snapshot.profitAndLoss.totalOpex, currency, locale)}`,
    `- Net Income: ${formatCurrency(snapshot.profitAndLoss.netIncome, currency, locale)}`,
  ];

  // Monthly trends (last 6 months or available)
  const recentRevenue = snapshot.revenueByMonth.slice(-6);
  if (recentRevenue.length > 0) {
    lines.push(``);
    lines.push(`## Monthly Revenue Trend`);
    for (const { month, amount } of recentRevenue) {
      lines.push(`- ${month}: ${formatCurrency(amount, currency, locale)}`);
    }
  }

  const recentCash = snapshot.cashByMonth.slice(-6);
  if (recentCash.length > 0) {
    lines.push(``);
    lines.push(`## Monthly Cash Position`);
    for (const { month, amount } of recentCash) {
      lines.push(`- ${month}: ${formatCurrency(amount, currency, locale)}`);
    }
  }

  // Funding
  if (snapshot.fundingRounds.length > 0) {
    lines.push(``);
    lines.push(`## Funding Rounds`);
    for (const round of snapshot.fundingRounds) {
      lines.push(`- ${round.name} (${round.type}): ${formatCurrency(round.amount, currency, locale)} on ${round.date}${round.isProjected ? " [projected]" : ""}`);
    }
  }

  // Available scenarios
  if (snapshot.scenarios.length > 1) {
    lines.push(``);
    lines.push(`## Available Scenarios`);
    for (const s of snapshot.scenarios) {
      lines.push(`- ${s.name} (${s.source})${s.status !== "active" ? ` [${s.status}]` : ""} — ID: ${s.id}`);
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
