/**
 * Weekly digest computation — aggregates key financial metrics
 * for the "Monday Morning CFO" feature. Produces both structured
 * metrics and a deterministic text summary (no AI required).
 */

import {
  monthKey,
  pctChange as pctChangeValue,
} from "@burnless/engine";
import { formatCurrency, type CurrencyCode } from "@burnless/types";
import { computeDashboardData } from "./compute-dashboard";
import { computeExpenseDetails } from "./compute-expenses";
import { computeRevenueDetails } from "./compute-revenue";
import { getDefaultScenario } from "./data";

// ── Types ────────────────────────────────────────────────────────────────

export interface DigestMetrics {
  // Cash & Runway
  cashPosition: number;
  prevCashPosition: number;
  cashChange: number;
  cashChangePercent: number;
  runway: number;
  prevRunway: number;

  // Burn
  burnRate: number;
  prevBurnRate: number;
  burnChangePercent: number;

  // Revenue
  mrr: number;
  prevMrr: number;
  mrrChangePercent: number;
  arr: number;
  totalRevenue: number;
  prevTotalRevenue: number;

  // Expenses
  totalExpenses: number;
  prevTotalExpenses: number;
  expenseChangePercent: number;
  topExpenseCategories: { name: string; amount: number; change: number }[];

  // Anomalies
  anomalyCount: number;
  anomalies: string[];

  // Headcount
  headcount: number;

  // Period
  currentMonth: string;
  prevMonth: string;
  weekStart: string;
}

// ── Helper ───────────────────────────────────────────────────────────────

function findMetric(
  series: { month: string; value: number }[],
  month: string
): number {
  return series.find((m) => m.month === month)?.value ?? 0;
}

function pctChange(current: number, previous: number): number {
  return pctChangeValue(current, previous) ?? 0;
}



function sign(n: number): string {
  return n >= 0 ? "+" : "";
}

// ── Main computation ─────────────────────────────────────────────────────

export async function computeWeeklyDigest(
  companyId: string
): Promise<DigestMetrics | null> {
  const scenario = await getDefaultScenario(companyId);
  if (!scenario) return null;

  const now = new Date();
  const currentMonth = monthKey(new Date(now.getFullYear(), now.getMonth(), 1));
  const prevMonth = monthKey(
    new Date(now.getFullYear(), now.getMonth() - 1, 1)
  );

  const [dashboard, expenses, _revenue] = await Promise.all([
    computeDashboardData(companyId, scenario.id),
    computeExpenseDetails(companyId, scenario.id),
    computeRevenueDetails(companyId, scenario.id),
  ]);

  const { metrics } = dashboard;

  // Cash
  const cashPosition =
    findMetric(metrics.cashPosition, currentMonth) || dashboard.startingCash;
  const prevCashPosition =
    findMetric(metrics.cashPosition, prevMonth) || dashboard.startingCash;
  const cashChange = cashPosition - prevCashPosition;

  // Burn
  const burnRate = findMetric(metrics.netBurnRate, currentMonth);
  const prevBurnRate = findMetric(metrics.netBurnRate, prevMonth);

  // Runway
  const runway = findMetric(metrics.cashRunwayMonths, currentMonth);
  const prevRunway = findMetric(metrics.cashRunwayMonths, prevMonth);

  // Revenue
  const mrr = findMetric(metrics.mrr, currentMonth);
  const prevMrr = findMetric(metrics.mrr, prevMonth);
  const totalRevenue = dashboard.totalRevenue.get(currentMonth) ?? 0;
  const prevTotalRevenue = dashboard.totalRevenue.get(prevMonth) ?? 0;

  // Expenses
  const totalExpenses = dashboard.totalExpenses.get(currentMonth) ?? 0;
  const prevTotalExpenses = dashboard.totalExpenses.get(prevMonth) ?? 0;

  // Top expense categories
  const topExpenseCategories = expenses.subcategoryBreakdown.slice(0, 5).map(
    (s) => ({
      name: s.subcategory,
      amount: s.amount,
      change: s.changePercent * 100,
    })
  );

  // Anomalies
  const anomalies = expenses.lineItems
    .filter((i) => i.isAnomaly)
    .map(
      (i) =>
        `${i.accountName} ${sign(i.changePercent * 100)}${(i.changePercent * 100).toFixed(0)}% MoM`
    );

  // Headcount
  const headcount = Math.round(
    dashboard.headcountSeries.get(currentMonth) ?? 0
  );

  // Week start (last Monday)
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  weekStart.setHours(0, 0, 0, 0);

  return {
    cashPosition,
    prevCashPosition,
    cashChange,
    cashChangePercent: pctChange(cashPosition, prevCashPosition),
    runway,
    prevRunway,
    burnRate,
    prevBurnRate,
    burnChangePercent: pctChange(burnRate, prevBurnRate),
    mrr,
    prevMrr,
    mrrChangePercent: pctChange(mrr, prevMrr),
    arr: mrr * 12,
    totalRevenue,
    prevTotalRevenue,
    totalExpenses,
    prevTotalExpenses,
    expenseChangePercent: pctChange(totalExpenses, prevTotalExpenses),
    topExpenseCategories,
    anomalyCount: anomalies.length,
    anomalies,
    headcount,
    currentMonth,
    prevMonth,
    weekStart: weekStart.toISOString(),
  };
}

// ── Deterministic summary (no AI) ────────────────────────────────────────

export function buildDeterministicSummary(m: DigestMetrics, currency: CurrencyCode = "USD"): string {
  const lines: string[] = [];

  lines.push(`Weekly Financial Summary — ${m.currentMonth}`);
  lines.push("");

  // Cash & Runway
  lines.push(
    `Cash: ${formatCurrency(m.cashPosition, currency, undefined, { compact: true })} (${sign(m.cashChangePercent)}${m.cashChangePercent.toFixed(1)}% MoM)`
  );
  lines.push(
    `Burn Rate: ${formatCurrency(m.burnRate, currency, undefined, { compact: true })}/mo (${sign(m.burnChangePercent)}${m.burnChangePercent.toFixed(1)}% MoM)`
  );
  lines.push(`Runway: ${Math.round(m.runway)} months`);
  lines.push("");

  // Revenue
  if (m.mrr > 0) {
    lines.push(
      `MRR: ${formatCurrency(m.mrr, currency, undefined, { compact: true })} (${sign(m.mrrChangePercent)}${m.mrrChangePercent.toFixed(1)}% MoM)`
    );
    lines.push(`ARR: ${formatCurrency(m.arr, currency, undefined, { compact: true })}`);
  }
  if (m.totalRevenue > 0) {
    lines.push(`Total Revenue: ${formatCurrency(m.totalRevenue, currency, undefined, { compact: true })}/mo`);
  }
  lines.push("");

  // Expenses
  lines.push(
    `Total Expenses: ${formatCurrency(m.totalExpenses, currency, undefined, { compact: true })}/mo (${sign(m.expenseChangePercent)}${m.expenseChangePercent.toFixed(1)}% MoM)`
  );
  if (m.topExpenseCategories.length > 0) {
    lines.push("Top Spend:");
    for (const cat of m.topExpenseCategories) {
      lines.push(
        `  - ${cat.name}: ${formatCurrency(cat.amount, currency, undefined, { compact: true })} (${sign(cat.change)}${cat.change.toFixed(0)}%)`
      );
    }
  }
  lines.push("");

  // Anomalies
  if (m.anomalyCount > 0) {
    lines.push(`Anomalies Detected (${m.anomalyCount}):`);
    for (const a of m.anomalies) {
      lines.push(`  - ${a}`);
    }
    lines.push("");
  }

  // Headcount
  if (m.headcount > 0) {
    lines.push(`Headcount: ${m.headcount}`);
  }

  return lines.join("\n");
}
