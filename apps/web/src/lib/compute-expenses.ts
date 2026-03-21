/**
 * Server-side expense detail computation — enriches raw forecast data with
 * subcategory derivation, anomaly detection, and recurring pattern identification.
 *
 * Used by the expenses page to transform basic forecast lines into an intelligent
 * spend management experience.
 */
import { cache } from "react";
import {
  computeAllForecastLines,
  aggregateByAccount,
  computeAllHeadcountCosts,
  categorizeTransaction,
  seriesToArray,
  monthKey,
  type ForecastLineInput,
  type HeadcountPlanInput,
} from "@burnless/engine";
import {
  getAccounts,
  getForecastLines,
  getHeadcountPlans,
} from "./data";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ExpenseLineItem {
  id: string;
  accountId: string;
  accountName: string;
  accountCategory: "operating_expense" | "cogs";
  subcategory: string;
  subcategoryConfidence: number;
  categorySource: "rule" | "merchant_memory" | "manual";
  method: string;
  parameters: Record<string, unknown>;
  startDate: string;
  endDate: string | null;
  currentAmount: number;
  prevAmount: number;
  changePercent: number;
  isRecurring: boolean;
  isAnomaly: boolean;
  monthlySeries: { month: string; value: number }[];
}

export interface SubcategoryBreakdown {
  subcategory: string;
  amount: number;
  percentage: number;
  prevAmount: number;
  changePercent: number;
  itemCount: number;
  isAnomaly: boolean;
}

export interface ExpenseDetails {
  lineItems: ExpenseLineItem[];
  subcategoryBreakdown: SubcategoryBreakdown[];
  monthlyBySubcategory: Record<string, unknown>[];
  anomalyCount: number;
  recurringCount: number;
  totalMonthlyCost: number;
  totalPrevMonthlyCost: number;
  subcategories: string[];
}

// ── Anomaly threshold ────────────────────────────────────────────────────────

const ANOMALY_THRESHOLD = 0.20; // 20% MoM increase flags anomaly

// ── Subcategory derivation ───────────────────────────────────────────────────

function deriveSubcategory(
  accountName: string,
  accountCategory: string,
): { subcategory: string; confidence: number; source: "rule" | "merchant_memory" | "manual" } {
  // Try categorization engine first
  const result = categorizeTransaction(accountName);
  if (result && result.confidence >= 0.5) {
    return { subcategory: result.subcategory, confidence: result.confidence, source: "rule" };
  }

  // Fallback: derive from account category
  if (accountCategory === "cogs") {
    return { subcategory: "Cost of Goods Sold", confidence: 0.6, source: "manual" };
  }

  // Generic operating expense fallback
  return { subcategory: "Other", confidence: 0.3, source: "manual" };
}

// ── Main computation ─────────────────────────────────────────────────────────

export const computeExpenseDetails = cache(async function computeExpenseDetails(
  companyId: string,
  scenarioId: string,
  year?: number,
): Promise<ExpenseDetails> {
  const now = new Date();
  const targetYear = year ?? now.getFullYear();
  const periodStart = new Date(targetYear, 0, 1);
  const periodEnd = new Date(targetYear, 11, 1);
  const currentMonth = monthKey(new Date(now.getFullYear(), now.getMonth(), 1));
  const prevMonth = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));

  const [accounts, fLines, hcPlans] = await Promise.all([
    getAccounts(companyId),
    getForecastLines(scenarioId),
    getHeadcountPlans(scenarioId),
  ]);

  const accountMap = new Map(accounts.map((a) => [a.id, a]));

  // Compute forecast values
  const forecastInputs: ForecastLineInput[] = fLines.map((fl) => ({
    id: fl.id,
    accountId: fl.accountId,
    method: fl.method,
    parameters: (fl.parameters ?? {}) as Record<string, unknown>,
    startDate: fl.startDate,
    endDate: fl.endDate,
  }));
  const forecastResults = computeAllForecastLines(forecastInputs, periodStart, periodEnd);
  const _accountForecasts = aggregateByAccount(forecastInputs, forecastResults);

  // Headcount costs
  const hcInputs: HeadcountPlanInput[] = hcPlans.map((hp) => ({
    id: hp.id,
    departmentId: hp.departmentId,
    title: hp.title,
    count: hp.count,
    salary: Number(hp.salary),
    startDate: hp.startDate,
    endDate: hp.endDate,
    benefitsRate: Number(hp.benefitsRate),
  }));
  const headcountCosts = computeAllHeadcountCosts(hcInputs, periodStart, periodEnd);

  // Build line items from forecast lines (expense accounts only)
  const lineItems: ExpenseLineItem[] = [];

  for (const fLine of fLines) {
    const account = accountMap.get(fLine.accountId);
    if (!account) continue;
    if (account.category !== "operating_expense" && account.category !== "cogs") continue;

    const values = forecastResults.get(fLine.id);
    if (!values) continue;

    const series = seriesToArray(values);
    const currentAmount = Number(values.get(currentMonth) ?? 0);
    const prevAmount = Number(values.get(prevMonth) ?? 0);
    const changePercent = prevAmount > 0 ? (currentAmount - prevAmount) / prevAmount : 0;

    // Derive subcategory from account name
    const { subcategory, confidence, source } = deriveSubcategory(account.name, account.category);

    // Recurring detection: fixed method or very low variance across months
    const amounts = series.map((s) => s.value).filter((v) => v > 0);
    const isRecurring = fLine.method === "fixed" || (amounts.length >= 3 && isLowVariance(amounts));

    // Anomaly detection: significant MoM increase
    const isAnomaly = prevAmount > 0 && changePercent > ANOMALY_THRESHOLD;

    lineItems.push({
      id: fLine.id,
      accountId: account.id,
      accountName: account.name,
      accountCategory: account.category as "operating_expense" | "cogs",
      subcategory,
      subcategoryConfidence: confidence,
      categorySource: source,
      method: fLine.method,
      parameters: (fLine.parameters ?? {}) as Record<string, unknown>,
      startDate: fLine.startDate instanceof Date ? fLine.startDate.toISOString().slice(0, 10) : String(fLine.startDate),
      endDate: fLine.endDate instanceof Date ? fLine.endDate.toISOString().slice(0, 10) : fLine.endDate ? String(fLine.endDate) : null,
      currentAmount,
      prevAmount,
      changePercent,
      isRecurring,
      isAnomaly,
      monthlySeries: series,
    });
  }

  // Add headcount as a synthetic line item if it has costs
  const hcCurrent = Number(headcountCosts.totalCost.get(currentMonth) ?? 0);
  const hcPrev = Number(headcountCosts.totalCost.get(prevMonth) ?? 0);
  if (hcCurrent > 0 || hcPrev > 0) {
    const hcChange = hcPrev > 0 ? (hcCurrent - hcPrev) / hcPrev : 0;
    lineItems.push({
      id: "headcount-synthetic",
      accountId: "headcount",
      accountName: "Personnel Costs",
      accountCategory: "operating_expense",
      subcategory: "People",
      subcategoryConfidence: 1.0,
      categorySource: "manual",
      method: "fixed",
      parameters: {},
      startDate: periodStart.toISOString().slice(0, 10),
      endDate: null,
      currentAmount: hcCurrent,
      prevAmount: hcPrev,
      changePercent: hcChange,
      isRecurring: true,
      isAnomaly: hcPrev > 0 && hcChange > ANOMALY_THRESHOLD,
      monthlySeries: seriesToArray(headcountCosts.totalCost),
    });
  }

  // Build subcategory breakdown
  const subcatMap = new Map<string, { amount: number; prevAmount: number; items: number; hasAnomaly: boolean }>();
  for (const item of lineItems) {
    const existing = subcatMap.get(item.subcategory) ?? { amount: 0, prevAmount: 0, items: 0, hasAnomaly: false };
    existing.amount += item.currentAmount;
    existing.prevAmount += item.prevAmount;
    existing.items += 1;
    if (item.isAnomaly) existing.hasAnomaly = true;
    subcatMap.set(item.subcategory, existing);
  }

  const totalMonthlyCost = lineItems.reduce((sum, i) => sum + i.currentAmount, 0);
  const totalPrevMonthlyCost = lineItems.reduce((sum, i) => sum + i.prevAmount, 0);

  const subcategoryBreakdown: SubcategoryBreakdown[] = Array.from(subcatMap.entries())
    .map(([subcategory, data]) => ({
      subcategory,
      amount: data.amount,
      percentage: totalMonthlyCost > 0 ? (data.amount / totalMonthlyCost) * 100 : 0,
      prevAmount: data.prevAmount,
      changePercent: data.prevAmount > 0 ? (data.amount - data.prevAmount) / data.prevAmount : 0,
      itemCount: data.items,
      isAnomaly: data.hasAnomaly,
    }))
    .sort((a, b) => b.amount - a.amount);

  // Build monthly-by-subcategory for stacked chart
  const allMonths = new Set<string>();
  for (const item of lineItems) {
    for (const pt of item.monthlySeries) allMonths.add(pt.month);
  }
  const sortedMonths = Array.from(allMonths).sort();
  const subcategories = subcategoryBreakdown.map((s) => s.subcategory);

  const monthlyBySubcategory = sortedMonths.map((month) => {
    const row: Record<string, unknown> = { month };
    for (const subcat of subcategories) {
      row[subcat] = 0;
    }
    for (const item of lineItems) {
      const pt = item.monthlySeries.find((p) => p.month === month);
      if (pt) {
        row[item.subcategory] = (row[item.subcategory] as number) + pt.value;
      }
    }
    return row;
  });

  const anomalyCount = lineItems.filter((i) => i.isAnomaly).length;
  const recurringCount = lineItems.filter((i) => i.isRecurring).length;

  return {
    lineItems,
    subcategoryBreakdown,
    monthlyBySubcategory,
    anomalyCount,
    recurringCount,
    totalMonthlyCost,
    totalPrevMonthlyCost,
    subcategories,
  };
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function isLowVariance(values: number[]): boolean {
  if (values.length < 2) return true;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return true;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const cv = Math.sqrt(variance) / mean; // coefficient of variation
  return cv < 0.05; // less than 5% variation
}
