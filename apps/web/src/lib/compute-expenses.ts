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
  computeAllHeadcountCosts,
  categorizeTransaction,
  seriesToArray,
  ratioChange,
  type ForecastLineInput,
  type HeadcountPlanInput,
} from "@burnless/engine";
import {
  getAccounts,
  getForecastLines,
  getHeadcountPlans,
} from "./data";
import { computeDashboardData } from "./compute-dashboard";
import { buildExpenseBreakdown, buildExpenseMonthlyBySubcategory } from "./breakdowns";
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
  /**
   * Raw per-line category override from the DB (`forecast_lines.subcategory`).
   * NULL when the category is auto-derived. Threaded so the edit form can
   * preselect "Auto" vs the explicit value (the displayed `subcategory` above
   * is always populated — it carries the derived value when this is null).
   */
  subcategoryOverride: string | null;
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
  /**
   * Persisted descriptive fields surfaced from the underlying forecast-line row.
   * Threaded through so the edit modal can prefill them — without this, an edit
   * that didn't touch these fields would PATCH `null` and overwrite the stored
   * values (Phase 1 §2.C data-loss guard).
   */
  vendor: string | null;
  notes: string | null;
  departmentId: string | null;
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

export function deriveSubcategory(
  accountName: string,
  accountCategory: string,
  explicit?: string | null,
): { subcategory: string; confidence: number; source: "rule" | "merchant_memory" | "manual" } {
  // Explicit per-line override (set in the expense form) WINS over derivation.
  if (typeof explicit === "string" && explicit.trim() !== "") {
    return { subcategory: explicit.trim(), confidence: 1, source: "manual" };
  }

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

// NOTE: `year` only sets the forecast window for lineItems enrichment. The blended
// breakdown + currentMonth always come from computeDashboardData at today's month.
export const computeExpenseDetails = cache(async function computeExpenseDetails(
  companyId: string,
  scenarioId: string | null,
  year?: number,
): Promise<ExpenseDetails> {
  const now = new Date();
  const targetYear = year ?? now.getFullYear();
  const periodStart = new Date(targetYear, 0, 1);
  const periodEnd = new Date(targetYear, 11, 1);

  const [accounts, fLines, hcPlans, dash] = await Promise.all([
    getAccounts(companyId),
    getForecastLines(companyId, scenarioId),
    getHeadcountPlans(companyId, scenarioId),
    computeDashboardData(companyId, scenarioId),
  ]);

  // Canonical "as of" months come from the dashboard so anomaly baselines and
  // breakdown totals read the same month the headline KPIs do.
  const currentMonth = dash.currentMonth;
  const prevMonth = dash.prevMonth;

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

  // Headcount costs
  const hcInputs: HeadcountPlanInput[] = hcPlans.map((hp) => ({
    id: hp.id,
    departmentId: hp.departmentId,
    title: hp.title,
    name: hp.name ?? null,
    employeeType: hp.employeeType,
    count: Number(hp.count),
    salary: Number(hp.salary),
    hourlyRate: hp.hourlyRate == null ? null : Number(hp.hourlyRate),
    hoursPerWeek: hp.hoursPerWeek == null ? null : Number(hp.hoursPerWeek),
    startDate: new Date(hp.startDate),
    endDate: hp.endDate ? new Date(hp.endDate) : null,
    benefitsRate: Number(hp.benefitsRate),
    benefitsBreakdown: (hp.parameters as { benefitsBreakdown?: HeadcountPlanInput["benefitsBreakdown"] } | null)?.benefitsBreakdown,
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
    const changePercent = ratioChange(currentAmount, prevAmount) ?? 0;

    // Derive subcategory from account name — explicit per-line override wins.
    const { subcategory, confidence, source } = deriveSubcategory(
      account.name,
      account.category,
      (fLine as { subcategory?: string | null }).subcategory ?? null,
    );

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

    const fLineRow = fLine as {
      vendor?: string | null;
      notes?: string | null;
      departmentId?: string | null;
    };

    lineItems.push({
      id: fLine.id,
      accountId: account.id,
      accountName: account.name,
      accountCategory: account.category as "operating_expense" | "cogs",
      subcategory,
      subcategoryConfidence: confidence,
      categorySource: source,
      subcategoryOverride:
        typeof (fLine as { subcategory?: string | null }).subcategory === "string" &&
        (fLine as { subcategory?: string | null }).subcategory!.trim() !== ""
          ? (fLine as { subcategory?: string | null }).subcategory!.trim()
          : null,
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
      vendor: fLineRow.vendor ?? null,
      notes: fLineRow.notes ?? null,
      departmentId: fLineRow.departmentId ?? null,
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
    const hcChange = ratioChange(hcCurrent, hcPrev) ?? 0;
    lineItems.push({
      id: "headcount-synthetic",
      accountId: "headcount",
      accountName: "Personnel Costs",
      accountCategory: "operating_expense",
      subcategory: "People",
      subcategoryConfidence: 1.0,
      categorySource: "manual",
      subcategoryOverride: null,
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
      // Synthetic personnel-cost row has no underlying forecast_lines record.
      vendor: null,
      notes: null,
      departmentId: null,
    });
  }

  // Per-account explicit category override (from the expense form's Category
  // field). The blended breakdown is account-aggregated, so each account adopts
  // the dominant explicit subcategory among its forecast lines (if any). This
  // makes the category chart + AI insight honor the user's per-entry category —
  // mirroring the per-line override already applied to lineItems above. Accounts
  // with no forecast line (transaction-only) carry no override and derive as before.
  const subcatByAccount = (() => {
    const counts = new Map<string, Map<string, number>>(); // accountId → (subcat → count)
    for (const fl of fLines) {
      const sc = (fl as { subcategory?: string | null }).subcategory;
      if (typeof sc !== "string" || sc.trim() === "") continue;
      const key = sc.trim();
      const inner = counts.get(fl.accountId) ?? new Map<string, number>();
      inner.set(key, (inner.get(key) ?? 0) + 1);
      counts.set(fl.accountId, inner);
    }
    const out = new Map<string, string>();
    for (const [accountId, inner] of counts) {
      let best = "";
      let bestN = -1;
      for (const [sc, n] of inner) if (n > bestN) { best = sc; bestN = n; }
      if (best) out.set(accountId, best);
    }
    return out;
  })();

  // Single-source: breakdown/totals reconcile to blended totalExpenses;
  // lineItems/expenseMix remain forecast-line "plan detail".
  const blendedTotal = dash.totalExpenses.get(currentMonth) ?? 0;
  const blended = buildExpenseBreakdown(dash.expenseLines, currentMonth, blendedTotal, subcatByAccount);
  const prevTotal = dash.totalExpenses.get(prevMonth) ?? 0;
  const prevBySubcat = new Map(
    buildExpenseBreakdown(dash.expenseLines, prevMonth, prevTotal, subcatByAccount).map((b) => [b.subcategory, b.amount]),
  );
  const subcategoryBreakdown: SubcategoryBreakdown[] = blended.map((b) => {
    const items = lineItems.filter((i) => i.subcategory === b.subcategory);
    const prevAmount = prevBySubcat.get(b.subcategory) ?? 0;
    return {
      subcategory: b.subcategory,
      amount: b.amount,
      percentage: b.share,
      prevAmount,
      changePercent: ratioChange(b.amount, prevAmount) ?? 0,
      itemCount: items.length,
      isAnomaly: items.some((i) => i.isAnomaly),
    };
  });
  const totalMonthlyCost = blendedTotal;
  const totalPrevMonthlyCost = dash.totalExpenses.get(prevMonth) ?? 0;

  // Stacked-chart series — blended per-month, same subcategory grouping.
  const monthlyBySubcategory = buildExpenseMonthlyBySubcategory(dash.expenseLines, subcatByAccount);
  // `subcategories` (chart's top-6/Other selection) is ordered by current-month
  // spend, matching the split panel below.
  const subcategories = subcategoryBreakdown.map((s) => s.subcategory);

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
