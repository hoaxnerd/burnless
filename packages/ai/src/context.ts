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
import type { FinancialSnapshot, RevenueStreamSnapshotRow, ExpenseSnapshotRow } from "./types";

/** Structural input shape for a revenue stream passed to `buildFinancialSnapshot`. */
export interface RevenueStreamLike {
  id: string;
  name: string;
  type: RevenueStreamSnapshotRow["type"];
  startDate: Date | string;
  endDate: Date | string | null;
  parameters: Record<string, unknown>;
  /** Resolved current-month revenue from the engine. */
  currentAmount?: number;
}

/** Structural input shape for an expense line passed to `buildFinancialSnapshot`. */
export interface ExpenseLineLike {
  id: string;
  accountId: string;
  accountName: string;
  vendor?: string | null;
  notes?: string | null;
  frequency?: "monthly" | "quarterly" | "annual";
  departmentId?: string | null;
  isOneTime?: boolean;
  isRecurring?: boolean | null;
  method: "fixed" | "growth_rate" | "per_unit" | "percentage_of" | "custom_formula";
  currentAmount: number;
}

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
    id: string;
    name: string;
    type: string;
    amount: number;
    date: string;
    closeDate?: string | null;
    isProjected: boolean;
    parameters?: Record<string, unknown>;
    investors?: Array<{ name: string; amountInvested: number }>;
  }>;
  revenueStreams?: RevenueStreamLike[];
  headcountDetails: Array<{
    id: string;
    title: string;
    name: string | null;
    employeeType: string;
    count: number;
    salary: number;
    salaryChanges: Array<{
      effectiveDate: string;
      newSalary: number;
      reason: string | null;
    }>;
    bonuses: Array<{
      payoutMonth: string;
      amount: number;
      type: string;
    }>;
    equityGrants: Array<{
      grantDate: string;
      shares: number;
      grantType: string;
      vestingSchedule: Array<{ type: string; date: string; sharesVested: number }>;
    }>;
  }>;
  expenseLines?: ExpenseLineLike[];
}

/**
 * FMT-2: read a metric series at the REAL current calendar month (dashboard↔AI
 * parity). After Phase B the series spans the full horizon, so the LAST element
 * is an end-of-horizon projection, not "today" — the AI snapshot must read at
 * `period.currentMonth`, matching the dashboard headline. Falls back to the last
 * element when the month is absent.
 */
function metricValueAtMonth(
  values: Array<{ month: string; value: number }> | undefined,
  currentMonth: string,
): number | null {
  if (!values || values.length === 0) return null;
  const atMonth = values.find((v) => v.month === currentMonth);
  const v = (atMonth ?? values[values.length - 1]!).value;
  // Phase 5 §5.6: production-dark metrics arrive as non-finite (NaN/Infinity)
  // from the engine's NaN-gates (cac with no acquisitionSpend, ltvCacRatio
  // inheriting it, ltv with non-positive churn). Coerce to null so the prompt's
  // existing N/A guards drop the line — the AI must never assert "0.0x LTV:CAC".
  return Number.isFinite(v) ? v : null;
}

/** Sum all values in a StatementLineItem's values array. */
function sumLineItem(values: Array<{ month: string; value: number }> | undefined): number {
  if (!values || values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v.value, 0);
}

/** Build the financial snapshot for AI context. */
export function buildFinancialSnapshot(input: ContextInput): FinancialSnapshot {
  const { metrics, profitAndLoss } = input;
  const cm = input.period.currentMonth;

  return {
    company: input.company,
    scenario: input.scenario,
    period: input.period,
    keyMetrics: {
      mrr: metricValueAtMonth(metrics.mrr, cm),
      arr: metricValueAtMonth(metrics.arr, cm),
      burnRate: metricValueAtMonth(metrics.burnRate, cm),
      netBurn: metricValueAtMonth(metrics.netBurnRate, cm),
      runway: metricValueAtMonth(metrics.cashRunwayMonths, cm),
      cashPosition: metricValueAtMonth(metrics.cashPosition, cm),
      revenueGrowth: metricValueAtMonth(metrics.revenueGrowthRate, cm),
      grossMargin: metricValueAtMonth(metrics.grossMarginPercent, cm),
      headcount: metricValueAtMonth(metrics.revenuePerEmployee, cm) !== null ? null : null, // Headcount comes from the series
      ltv: metricValueAtMonth(metrics.ltv, cm),
      cac: metricValueAtMonth(metrics.cac, cm),
      ltvCacRatio: metricValueAtMonth(metrics.ltvCacRatio, cm),
      churnRate: metricValueAtMonth(metrics.customerChurnRate, cm),
    },
    revenueByMonth: seriesToArray(input.totalRevenue).map((v) => ({ month: v.month, amount: v.value })),
    revenueStreams: (input.revenueStreams ?? []).map((s) => {
      const sd = typeof s.startDate === "string" ? s.startDate : s.startDate.toISOString().slice(0, 10);
      const ed = s.endDate
        ? (typeof s.endDate === "string" ? s.endDate : s.endDate.toISOString().slice(0, 10))
        : null;
      const params = s.parameters as Record<string, unknown>;
      const pricingModel = params?.pricingModel as RevenueStreamSnapshotRow["pricingModel"] | undefined;
      const tiers = Array.isArray(params?.tiers) ? (params.tiers as unknown[]) : undefined;
      return {
        id: s.id,
        name: s.name,
        type: s.type,
        startDate: sd,
        endDate: ed,
        parameters: params,
        currentAmount: s.currentAmount ?? 0,
        pricingModel,
        tierCount: tiers?.length,
      };
    }),
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
    fundingRounds: input.fundingRounds.map((r) => ({
      name: r.name,
      type: r.type,
      amount: r.amount,
      date: r.date,
      closeDate: r.closeDate ?? null,
      isProjected: r.isProjected ?? false,
      parameters: r.parameters ?? {},
      investors: (r.investors ?? []).map((i) => ({
        name: i.name,
        amountInvested: Number(i.amountInvested),
      })),
      interestPaidYtd: 0,
      principalPaidYtd: 0,
    })),
    scenarios: input.scenarios,
    accounts: input.accounts,
    departments: input.departments,
    headcountDetails: input.headcountDetails,
    expenses: (input.expenseLines ?? []).map<ExpenseSnapshotRow>((l) => ({
      id: l.id,
      accountId: l.accountId,
      accountName: l.accountName,
      vendor: l.vendor ?? null,
      notes: l.notes ?? null,
      frequency: l.frequency ?? "monthly",
      departmentId: l.departmentId ?? null,
      isOneTime: l.isOneTime ?? false,
      isRecurring: l.isRecurring ?? null,
      method: l.method,
      currentAmount: l.currentAmount,
    })),
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

  if (snapshot.revenueStreams.length > 0) {
    // Cap at 20 highest-currentAmount streams to keep prompt compact.
    const top = [...snapshot.revenueStreams]
      .sort((a, b) => b.currentAmount - a.currentAmount)
      .slice(0, 20);
    lines.push(``);
    lines.push(`## Active Revenue Streams`);
    for (const s of top) {
      const dateRange = s.endDate ? `${s.startDate} → ${s.endDate}` : `${s.startDate} → open`;
      const pricing = s.pricingModel && s.pricingModel !== "flat"
        ? ` [${s.pricingModel}${s.tierCount ? `, ${s.tierCount} tiers` : ""}]`
        : "";
      lines.push(`- ${s.name} (${s.type})${pricing} — ${formatCurrency(s.currentAmount, currency, locale)} (active ${dateRange})`);
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

  // Per-headcount detail (Phase 1 §1.5)
  if (snapshot.headcountDetails.length > 0) {
    lines.push(``);
    lines.push(`## Team Detail`);
    for (const hc of snapshot.headcountDetails) {
      const namePart = hc.name ? ` (${hc.name})` : "";
      const fteSuffix = hc.count !== 1 ? ` × ${hc.count} FTE` : "";
      lines.push(
        `- ${hc.title}${namePart} [${hc.employeeType}]${fteSuffix} — base salary ${formatCurrency(hc.salary, currency, locale)} — ID: ${hc.id}`
      );
      if (hc.salaryChanges.length > 0) {
        for (const sc of hc.salaryChanges) {
          const reasonPart = sc.reason ? ` (${sc.reason})` : "";
          lines.push(
            `  - Salary change ${sc.effectiveDate}: → ${formatCurrency(sc.newSalary, currency, locale)}${reasonPart}`
          );
        }
      }
      if (hc.bonuses.length > 0) {
        for (const b of hc.bonuses) {
          lines.push(
            `  - Bonus ${b.payoutMonth} [${b.type}]: ${formatCurrency(b.amount, currency, locale)}`
          );
        }
      }
      if (hc.equityGrants.length > 0) {
        for (const g of hc.equityGrants) {
          const vestedTotal = g.vestingSchedule.reduce((s, v) => s + v.sharesVested, 0);
          lines.push(
            `  - Equity ${g.grantDate} [${g.grantType.toUpperCase()}]: ${g.shares} shares (${g.vestingSchedule.length} vesting milestones, ${vestedTotal} scheduled to vest)`
          );
        }
      }
    }
  }

  // Active expense lines (top 50 by currentAmount desc).
  // Engine + AI layer never print currency symbols — emit raw numeric amounts; the
  // web app formats currency at the boundary if/when this text is surfaced to a user.
  if (snapshot.expenses.length > 0) {
    const top = [...snapshot.expenses]
      .sort((a, b) => b.currentAmount - a.currentAmount)
      .slice(0, 50);
    lines.push(``);
    lines.push(`## Active expense lines`);
    for (const e of top) {
      const recurringAnnotation =
        e.isRecurring === true ? ", recurring" : e.isRecurring === false ? ", non-recurring" : "";
      const vendorAnnotation = e.vendor ? ` — ${e.vendor}` : "";
      lines.push(
        `- ${e.accountName} (${e.method}, ${e.frequency}${recurringAnnotation}${vendorAnnotation}): ${e.currentAmount}`,
      );
    }
  }

  return lines.join("\n");
}
