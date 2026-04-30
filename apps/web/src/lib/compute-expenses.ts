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
import {
  shouldFlagAnomaly,
  getAnomalyBaseline,
  suggestRecurring,
  type ExpenseFrequency,
  type AnomalyContextLine,
} from "./compute-expenses-helpers";

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
  /**
   * Provenance for `isRecurring`:
   *   "user"      — explicit user choice (DB column was non-null).
   *   "suggested" — column null, suggestRecurring() flagged likely.
   *   "none"      — column null, suggestion didn't engage / sample too small.
   */
  recurringSource: "user" | "suggested" | "none";
  isAnomaly: boolean;
  isOneTime: boolean;
  frequency: ExpenseFrequency;
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
  /**
   * Component sums of current-month opex by method/flag — feeds the
   * fixedExpenses / variableExpenses / percentageDrivenExpenses /
   * oneTimeExpenses dashboard slugs (Phase 1 §1.5 MANDATE).
   */
  expenseMix: {
    fixedExpenses: number;
    variableExpenses: number;
    percentageDrivenExpenses: number;
    oneTimeExpenses: number;
  };
}

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
  return { subcategory: "Uncategorized", confidence: 0.3, source: "manual" };
}

// ── Date coercion ────────────────────────────────────────────────────────────

const toIso = (d: Date | string | null | undefined): string | null =>
  d == null ? null : (typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10));

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
    startDate: new Date(fl.startDate),
    endDate: fl.endDate ? new Date(fl.endDate) : null,
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
    startDate: new Date(hp.startDate),
    endDate: hp.endDate ? new Date(hp.endDate) : null,
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
    const startDate = toIso(fLine.startDate) ?? `${targetYear}-01-01`;
    const endDate = toIso(fLine.endDate);
    const frequency: ExpenseFrequency =
      (fLine as { frequency?: ExpenseFrequency }).frequency ?? "monthly";
    const isOneTime = Boolean((fLine as { isOneTime?: boolean }).isOneTime ?? false);

    const ctx: AnomalyContextLine = {
      method: fLine.method,
      startDate,
      endDate,
      frequency,
    };

    // Frequency-aware baseline (monthly → t-1, quarterly → t-3, annual → t-12).
    const currentAmount = Number(values.get(currentMonth) ?? 0);
    const prevAmount = getAnomalyBaseline(ctx, currentMonth, values);
    const changePercent = prevAmount > 0 ? (currentAmount - prevAmount) / prevAmount : 0;

    // Derive subcategory from account name
    const { subcategory, confidence, source } = deriveSubcategory(account.name, account.category);

    // Recurring: explicit user choice wins; otherwise fall back to the
    // variance-based suggestion (suggestion-only when DB column is null).
    const amounts = series.map((s) => s.value).filter((v) => v > 0);
    const recurringSuggestion = suggestRecurring(amounts);
    const explicit = (fLine as { isRecurring?: boolean | null }).isRecurring;
    const hasExplicit = explicit !== null && explicit !== undefined;
    const isRecurring = hasExplicit ? Boolean(explicit) : recurringSuggestion.likely;
    const recurringSource: "user" | "suggested" | "none" = hasExplicit
      ? "user"
      : recurringSuggestion.likely
        ? "suggested"
        : "none";

    // Anomaly: endDate-aware + frequency-aware (helpers honor both rules).
    const isAnomaly = shouldFlagAnomaly(ctx, currentMonth, prevAmount, currentAmount);

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
      startDate,
      endDate,
      currentAmount,
      prevAmount,
      changePercent,
      isRecurring,
      recurringSource,
      isAnomaly,
      isOneTime,
      frequency,
      monthlySeries: series,
    });
  }

  // Add headcount as a synthetic line item if it has costs
  const hcCurrent = Number(headcountCosts.totalCost.get(currentMonth) ?? 0);
  const hcPrev = Number(headcountCosts.totalCost.get(prevMonth) ?? 0);
  if (hcCurrent > 0 || hcPrev > 0) {
    const hcCtx: AnomalyContextLine = {
      method: "fixed",
      startDate: periodStart.toISOString().slice(0, 10),
      endDate: null,
      frequency: "monthly",
    };
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
      recurringSource: "user", // synthetic personnel costs are always treated as user-recurring
      isAnomaly: shouldFlagAnomaly(hcCtx, currentMonth, hcPrev, hcCurrent),
      isOneTime: false,
      frequency: "monthly",
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

  // Component-metric emission — current-month sums per method/flag bucket
  // (Phase 1 §1.5 MANDATE; one-time is independent of method).
  let fixedSum = 0;
  let variableSum = 0;
  let percentageSum = 0;
  let oneTimeSum = 0;
  for (const item of lineItems) {
    if (item.method === "fixed") fixedSum += item.currentAmount;
    else if (item.method === "growth_rate" || item.method === "per_unit") variableSum += item.currentAmount;
    else if (item.method === "percentage_of" || item.method === "custom_formula") percentageSum += item.currentAmount;
    if (item.isOneTime) oneTimeSum += item.currentAmount;
  }

  return {
    lineItems,
    subcategoryBreakdown,
    monthlyBySubcategory,
    anomalyCount,
    recurringCount,
    totalMonthlyCost,
    totalPrevMonthlyCost,
    subcategories,
    expenseMix: {
      fixedExpenses: fixedSum,
      variableExpenses: variableSum,
      percentageDrivenExpenses: percentageSum,
      oneTimeExpenses: oneTimeSum,
    },
  };
});
