/**
 * Financial statement generator — produces P&L, Balance Sheet, and Cash Flow
 * from account-level monthly data.
 *
 * Three-statement model: P&L feeds into Cash Flow, which feeds into Balance Sheet.
 */

import type { AccountCategory } from "@burnless/types";
import {
  type MonthlySeries,
  round2,
  addSeries,
  subtractSeries,
  seriesToArray,
} from "./utils";
import { D, dRound2 } from "./decimal";
import type { FundingImpact } from "./funding";

// ── Types ────────────────────────────────────────────────────────────────────

export interface AccountData {
  id: string;
  name: string;
  category: AccountCategory;
  values: MonthlySeries;
}

/** P&L statement line item */
export interface StatementLineItem {
  name: string;
  values: { month: string; value: number }[];
  children?: StatementLineItem[];
}

export interface ProfitAndLoss {
  revenue: StatementLineItem;
  cogs: StatementLineItem;
  grossProfit: StatementLineItem;
  operatingExpenses: StatementLineItem;
  operatingIncome: StatementLineItem;
  otherIncome: StatementLineItem;
  otherExpenses: StatementLineItem;
  netIncome: StatementLineItem;
  /** Gross margin as percentage */
  grossMargin: { month: string; value: number }[];
  /** Net margin as percentage */
  netMargin: { month: string; value: number }[];
}

export interface CashFlowStatement {
  operatingCashFlow: StatementLineItem;
  investingCashFlow: StatementLineItem;
  financingCashFlow: StatementLineItem;
  netCashChange: StatementLineItem;
  /** Cumulative ending cash position */
  endingCash: { month: string; value: number }[];
}

export interface BalanceSheet {
  assets: StatementLineItem;
  currentAssets: StatementLineItem;
  fixedAssets: StatementLineItem;
  liabilities: StatementLineItem;
  currentLiabilities: StatementLineItem;
  longTermLiabilities: StatementLineItem;
  equity: StatementLineItem;
  workingCapital: { month: string; value: number }[];
  currentRatio: { month: string; value: number }[];
}

// ── Working Capital Types ─────────────────────────────────────────────────────

/** Payment terms configuration for A/R and A/P modeling. */
export interface PaymentTerms {
  /** Days until payment is collected/due (e.g., 30 for Net-30) */
  days: number;
}

/** Configuration for working capital modeling in cash flow. */
export interface WorkingCapitalConfig {
  /** Accounts receivable payment terms (how long until customers pay) */
  receivableTerms?: PaymentTerms;
  /** Accounts payable payment terms (how long until you pay suppliers) */
  payableTerms?: PaymentTerms;
  /** Capital assets with depreciation schedules */
  capitalAssets?: CapitalAsset[];
  /** Starting A/R balance */
  startingReceivables?: number;
  /** Starting A/P balance */
  startingPayables?: number;
}

/** A capital asset with a depreciation schedule. */
export interface CapitalAsset {
  name: string;
  /** Purchase cost */
  cost: number;
  /** Useful life in months */
  usefulLifeMonths: number;
  /** Salvage value at end of life */
  salvageValue?: number;
  /** Purchase month key (e.g., "2026-01") */
  purchaseMonth: string;
  /** Depreciation method */
  method?: "straight_line"; // Only straight-line for now
}

/** Working capital adjustments computed for cash flow indirect method. */
export interface WorkingCapitalAdjustments {
  /** Change in A/R (increase = cash decrease) */
  arChange: MonthlySeries;
  /** Change in A/P (increase = cash increase) */
  apChange: MonthlySeries;
  /** Total depreciation expense (non-cash, add back) */
  depreciation: MonthlySeries;
  /** A/R balance per month */
  accountsReceivable: MonthlySeries;
  /** A/P balance per month */
  accountsPayable: MonthlySeries;
  /** CapEx cash outflows */
  capitalExpenditures: MonthlySeries;
}

// ── P&L Generation ───────────────────────────────────────────────────────────

/** Optional inputs to enrich the P&L with synthesized sub-lines (umbrella §1.3, §1.4). */
export interface ProfitAndLossOptions {
  /**
   * When provided, the operating-expenses node gains a synthesized "Benefits"
   * sub-line whose four children are the generic employer-benefits components.
   */
  personnelBreakdown?: {
    benefitsByComponent: Map<string, MonthlySeries>;
  };
}

/** Generate a P&L statement from account-level data. */
export function generateProfitAndLoss(
  accounts: AccountData[],
  options: ProfitAndLossOptions = {},
): ProfitAndLoss {
  const revenueSeries = sumByCategory(accounts, "revenue");
  const cogsSeries = sumByCategory(accounts, "cogs");
  const opexSeries = sumByCategory(accounts, "operating_expense");
  const otherIncomeSeries = sumByCategory(accounts, "other_income");
  const otherExpenseSeries = sumByCategory(accounts, "other_expense");

  const grossProfitSeries = subtractSeries(revenueSeries, cogsSeries);
  const operatingIncomeSeries = subtractSeries(grossProfitSeries, opexSeries);
  const netIncomeSeries = addSeries(
    addSeries(operatingIncomeSeries, otherIncomeSeries),
    subtractSeries(new Map(), otherExpenseSeries) // negate other expenses
  );

  // Margins
  const grossMargin = computeMargin(grossProfitSeries, revenueSeries);
  const netMargin = computeMargin(netIncomeSeries, revenueSeries);

  const result: ProfitAndLoss = {
    revenue: buildLineItem("Revenue", revenueSeries, filterByCategory(accounts, "revenue")),
    cogs: buildLineItem("Cost of Goods Sold", cogsSeries, filterByCategory(accounts, "cogs")),
    grossProfit: buildLineItem("Gross Profit", grossProfitSeries),
    operatingExpenses: buildLineItem("Operating Expenses", opexSeries, filterByCategory(accounts, "operating_expense")),
    operatingIncome: buildLineItem("Operating Income", operatingIncomeSeries),
    otherIncome: buildLineItem("Other Income", otherIncomeSeries, filterByCategory(accounts, "other_income")),
    otherExpenses: buildLineItem("Other Expenses", otherExpenseSeries, filterByCategory(accounts, "other_expense")),
    netIncome: buildLineItem("Net Income", netIncomeSeries),
    grossMargin,
    netMargin,
  };

  if (options.personnelBreakdown?.benefitsByComponent) {
    const componentLabels: Record<string, string> = {
      statutoryEmployerContributionsCost: "Statutory Employer Contributions",
      insuranceBenefitsCost: "Insurance Benefits",
      retirementContributionsCost: "Retirement Contributions",
      otherBenefitsCost: "Other Benefits",
    };
    const childItems: StatementLineItem[] = [];
    let benefitsTotal: MonthlySeries = new Map();
    for (const [key, label] of Object.entries(componentLabels)) {
      const series = options.personnelBreakdown.benefitsByComponent.get(key) ?? new Map<string, number>();
      benefitsTotal = addSeries(benefitsTotal, series);
      childItems.push({
        name: label,
        values: seriesToArray(series),
      });
    }
    const benefitsLine: StatementLineItem = {
      name: "Benefits",
      values: seriesToArray(benefitsTotal),
      children: childItems,
    };
    if (!result.operatingExpenses.children) result.operatingExpenses.children = [];
    result.operatingExpenses.children.push(benefitsLine);
  }

  return result;
}

// ── Working Capital Modeling ─────────────────────────────────────────────────

/**
 * Compute A/R balances based on revenue and payment terms.
 * Revenue recognized in month M gets collected after `days` days.
 * For Net-30: ~1 month of revenue sits in A/R.
 * For Net-60: ~2 months of revenue sits in A/R.
 */
export function computeAccountsReceivable(
  revenueSeries: MonthlySeries,
  terms: PaymentTerms,
  startingBalance: number = 0
): { balance: MonthlySeries; change: MonthlySeries } {
  const balance: MonthlySeries = new Map();
  const change: MonthlySeries = new Map();
  const months = Array.from(revenueSeries.keys()).sort();

  // Convert days to fraction of months (approximate: 30 days = 1 month)
  const lagMonths = Math.floor(terms.days / 30);
  const lagFraction = D(terms.days % 30).div(30);

  let prevBalance = D(startingBalance);

  for (let i = 0; i < months.length; i++) {
    const m = months[i]!;
    const currentRevenue = D(revenueSeries.get(m) ?? 0);

    // A/R balance = revenue not yet collected
    // Full months of lag: revenue from recent months still uncollected
    let arBalance = D(0);

    // Add revenue from months that haven't been fully collected yet
    for (let lag = 0; lag < lagMonths && i - lag >= 0; lag++) {
      const lagMonth = months[i - lag]!;
      arBalance = arBalance.plus(revenueSeries.get(lagMonth) ?? 0);
    }

    // Partial month: fractional amount from the oldest uncollected month
    if (lagFraction.gt(0) && i - lagMonths >= 0) {
      const partialMonth = months[i - lagMonths]!;
      arBalance = arBalance.plus(
        D(revenueSeries.get(partialMonth) ?? 0).mul(lagFraction)
      );
    }

    // If we don't have enough history, use current revenue * fraction
    if (i < lagMonths) {
      arBalance = currentRevenue.mul(D(terms.days).div(30));
    }

    const arVal = dRound2(arBalance);
    balance.set(m, arVal);
    change.set(m, dRound2(D(arVal).minus(prevBalance)));
    prevBalance = D(arVal);
  }

  return { balance, change };
}

/**
 * Compute A/P balances based on expenses and payment terms.
 * Expenses incurred in month M get paid after `days` days.
 */
export function computeAccountsPayable(
  expenseSeries: MonthlySeries,
  terms: PaymentTerms,
  startingBalance: number = 0
): { balance: MonthlySeries; change: MonthlySeries } {
  const balance: MonthlySeries = new Map();
  const change: MonthlySeries = new Map();
  const months = Array.from(expenseSeries.keys()).sort();

  const lagMonths = Math.floor(terms.days / 30);
  const lagFraction = D(terms.days % 30).div(30);

  let prevBalance = D(startingBalance);

  for (let i = 0; i < months.length; i++) {
    const m = months[i]!;
    const currentExpense = D(expenseSeries.get(m) ?? 0);

    let apBalance = D(0);

    for (let lag = 0; lag < lagMonths && i - lag >= 0; lag++) {
      const lagMonth = months[i - lag]!;
      apBalance = apBalance.plus(expenseSeries.get(lagMonth) ?? 0);
    }

    if (lagFraction.gt(0) && i - lagMonths >= 0) {
      const partialMonth = months[i - lagMonths]!;
      apBalance = apBalance.plus(
        D(expenseSeries.get(partialMonth) ?? 0).mul(lagFraction)
      );
    }

    if (i < lagMonths) {
      apBalance = currentExpense.mul(D(terms.days).div(30));
    }

    const apVal = dRound2(apBalance);
    balance.set(m, apVal);
    change.set(m, dRound2(D(apVal).minus(prevBalance)));
    prevBalance = D(apVal);
  }

  return { balance, change };
}

/**
 * Compute straight-line depreciation for capital assets.
 * Monthly depreciation = (cost - salvageValue) / usefulLifeMonths
 */
export function computeDepreciation(
  assets: CapitalAsset[],
  monthKeys: string[]
): { monthly: MonthlySeries; capex: MonthlySeries } {
  const monthly: MonthlySeries = new Map();
  const capex: MonthlySeries = new Map();

  // Initialize all months to 0
  for (const m of monthKeys) {
    monthly.set(m, 0);
    capex.set(m, 0);
  }

  for (const asset of assets) {
    const salvage = D(asset.salvageValue ?? 0);
    const depreciableAmount = D(asset.cost).minus(salvage);
    const monthlyDep = dRound2(depreciableAmount.div(asset.usefulLifeMonths));
    const purchaseIdx = monthKeys.indexOf(asset.purchaseMonth);

    // Record CapEx in purchase month
    if (purchaseIdx >= 0) {
      capex.set(
        asset.purchaseMonth,
        dRound2(D(capex.get(asset.purchaseMonth) ?? 0).plus(asset.cost))
      );
    }

    // Record depreciation from purchase month through useful life
    for (let j = 0; j < asset.usefulLifeMonths; j++) {
      const depIdx = purchaseIdx + j;
      if (depIdx >= 0 && depIdx < monthKeys.length) {
        const m = monthKeys[depIdx]!;
        monthly.set(m, dRound2(D(monthly.get(m) ?? 0).plus(monthlyDep)));
      }
    }
  }

  return { monthly, capex };
}

/**
 * Compute all working capital adjustments for cash flow modeling.
 */
export function computeWorkingCapitalAdjustments(
  revenueSeries: MonthlySeries,
  expenseSeries: MonthlySeries,
  config: WorkingCapitalConfig
): WorkingCapitalAdjustments {
  const monthKeys = Array.from(
    new Set([...revenueSeries.keys(), ...expenseSeries.keys()])
  ).sort();

  // A/R modeling
  const receivableTerms = config.receivableTerms ?? { days: 0 };
  const { balance: arBalance, change: arChange } = receivableTerms.days > 0
    ? computeAccountsReceivable(revenueSeries, receivableTerms, config.startingReceivables ?? 0)
    : { balance: new Map<string, number>(), change: new Map<string, number>() };

  // A/P modeling
  const payableTerms = config.payableTerms ?? { days: 0 };
  const { balance: apBalance, change: apChange } = payableTerms.days > 0
    ? computeAccountsPayable(expenseSeries, payableTerms, config.startingPayables ?? 0)
    : { balance: new Map<string, number>(), change: new Map<string, number>() };

  // Depreciation
  const { monthly: depreciation, capex: capitalExpenditures } =
    config.capitalAssets && config.capitalAssets.length > 0
      ? computeDepreciation(config.capitalAssets, monthKeys)
      : { monthly: new Map<string, number>(), capex: new Map<string, number>() };

  return {
    arChange,
    apChange,
    depreciation,
    accountsReceivable: arBalance,
    accountsPayable: apBalance,
    capitalExpenditures,
  };
}

// ── Cash Flow Generation ─────────────────────────────────────────────────────

/**
 * Generate a cash flow statement using the indirect method.
 *
 * Operating CF = Net Income + Depreciation - ΔA/R + ΔA/P
 * Investing CF = -CapEx - other asset changes
 * Financing CF = liability changes + equity changes + funding
 *
 * Falls back to simplified model (CF ≈ net income) when no WorkingCapitalConfig provided.
 *
 * @param fundingInflows  **@deprecated** Phase 2 D introduced `fundingImpact`
 *   (5th arg) which structurally subsumes this Map. When both are supplied,
 *   `fundingImpact` wins and `fundingInflows` is silently ignored. New callers
 *   MUST pass `fundingImpact` and OMIT `fundingInflows`. The legacy parameter
 *   is retained only for backwards compatibility with `/api/statements` until
 *   Phase 3 F migrates it (then a future plan can remove this parameter
 *   outright). See Phase 3 F §F6.
 */
export function generateCashFlow(
  accounts: AccountData[],
  startingCash: number = 0,
  fundingInflows?: MonthlySeries,
  workingCapital?: WorkingCapitalConfig,
  fundingImpact?: FundingImpact,
): CashFlowStatement {
  // Net income (same as P&L)
  const revenue = sumByCategory(accounts, "revenue");
  const cogs = sumByCategory(accounts, "cogs");
  const opex = sumByCategory(accounts, "operating_expense");
  const otherIncome = sumByCategory(accounts, "other_income");
  const otherExpense = sumByCategory(accounts, "other_expense");

  const netIncome = subtractSeries(
    addSeries(subtractSeries(revenue, cogs), otherIncome),
    addSeries(opex, otherExpense)
  );

  let operatingCF: MonthlySeries;
  let investingCF: MonthlySeries;

  if (workingCapital) {
    // Indirect method: adjust net income for non-cash items and working capital changes
    const totalExpenses = addSeries(addSeries(cogs, opex), otherExpense);
    const adjustments = computeWorkingCapitalAdjustments(revenue, totalExpenses, workingCapital);

    // Operating CF = Net Income + Depreciation - ΔA/R + ΔA/P
    operatingCF = netIncome;
    operatingCF = addSeries(operatingCF, adjustments.depreciation); // add back non-cash depreciation
    operatingCF = subtractSeries(operatingCF, adjustments.arChange); // A/R increase = cash decrease
    operatingCF = addSeries(operatingCF, adjustments.apChange); // A/P increase = cash increase

    // Investing CF = -CapEx - other asset changes
    const assetChanges = sumByCategory(accounts, "asset");
    investingCF = subtractSeries(new Map(), assetChanges);
    investingCF = subtractSeries(investingCF, adjustments.capitalExpenditures);
  } else {
    // Simplified: operating CF = net income
    operatingCF = netIncome;

    // Investing: asset purchases
    const assetChanges = sumByCategory(accounts, "asset");
    investingCF = subtractSeries(new Map(), assetChanges);
  }

  // Financing: liability changes + equity changes + funding
  const liabilityChanges = sumByCategory(accounts, "liability");
  const equityChanges = sumByCategory(accounts, "equity");
  const legacyFinancing = addSeries(liabilityChanges, equityChanges);

  // Phase 2 D §1.3: split into equityInflows + debtInflows + principalPayments.
  let financingChildren: StatementLineItem[] | undefined;
  let financingCF: MonthlySeries;
  if (fundingImpact) {
    const equityInflows = fundingImpact.equityInflows;
    const debtInflows = fundingImpact.debtInflows;
    const principalNeg = new Map<string, number>();
    for (const [m, v] of fundingImpact.principalPayments) principalNeg.set(m, -v);
    financingChildren = [
      { name: "Equity Inflows", values: seriesToArray(equityInflows) },
      { name: "Debt Inflows", values: seriesToArray(debtInflows) },
      { name: "Principal Payments", values: seriesToArray(principalNeg) },
    ];
    financingCF = addSeries(addSeries(equityInflows, debtInflows), principalNeg);
  } else {
    let combined = legacyFinancing;
    if (fundingInflows) combined = addSeries(combined, fundingInflows);
    financingCF = combined;
  }

  const netCashChange = addSeries(addSeries(operatingCF, investingCF), financingCF);
  const endingCash = cumulativeSeries(netCashChange, startingCash);

  const financingCashFlow: StatementLineItem = {
    name: "Financing Cash Flow",
    values: seriesToArray(financingCF),
    children: financingChildren,
  };

  return {
    operatingCashFlow: buildLineItem("Operating Cash Flow", operatingCF),
    investingCashFlow: buildLineItem("Investing Cash Flow", investingCF),
    financingCashFlow,
    netCashChange: buildLineItem("Net Cash Change", netCashChange),
    endingCash: seriesToArray(endingCash),
  };
}

// ── Balance Sheet Generation ─────────────────────────────────────────────────

/**
 * Generate a balance sheet from account-level data.
 * Optionally includes working capital metrics (A/R, A/P, depreciated assets).
 */
export function generateBalanceSheet(
  accounts: AccountData[],
  workingCapitalAdjustments?: WorkingCapitalAdjustments
): BalanceSheet {
  const assetSeries = sumByCategory(accounts, "asset");
  const liabilitySeries = sumByCategory(accounts, "liability");
  const equitySeries = sumByCategory(accounts, "equity");

  // Current assets = cash + A/R + other current assets
  let currentAssetsSeries = assetSeries;
  if (workingCapitalAdjustments?.accountsReceivable) {
    currentAssetsSeries = addSeries(currentAssetsSeries, workingCapitalAdjustments.accountsReceivable);
  }

  // Fixed assets (net of depreciation) — tracked via asset accounts
  const fixedAssetsSeries: MonthlySeries = new Map();

  // Current liabilities = A/P + other current liabilities
  let currentLiabilitiesSeries = liabilitySeries;
  if (workingCapitalAdjustments?.accountsPayable) {
    currentLiabilitiesSeries = addSeries(currentLiabilitiesSeries, workingCapitalAdjustments.accountsPayable);
  }

  // Long-term liabilities (none separated for now — placeholder)
  const longTermLiabilitiesSeries: MonthlySeries = new Map();

  // Working capital = Current Assets - Current Liabilities
  const workingCapitalSeries = subtractSeries(currentAssetsSeries, currentLiabilitiesSeries);

  // Current ratio = Current Assets / Current Liabilities
  const currentRatio = computeMargin(currentAssetsSeries, currentLiabilitiesSeries);
  // Convert from percentage to ratio (divide by 100)
  const currentRatioFixed = currentRatio.map((v) => ({
    month: v.month,
    value: dRound2(D(v.value).div(100)),
  }));

  return {
    assets: buildLineItem("Total Assets", addSeries(currentAssetsSeries, fixedAssetsSeries), filterByCategory(accounts, "asset")),
    currentAssets: buildLineItem("Current Assets", currentAssetsSeries),
    fixedAssets: buildLineItem("Fixed Assets", fixedAssetsSeries),
    liabilities: buildLineItem("Total Liabilities", addSeries(currentLiabilitiesSeries, longTermLiabilitiesSeries), filterByCategory(accounts, "liability")),
    currentLiabilities: buildLineItem("Current Liabilities", currentLiabilitiesSeries),
    longTermLiabilities: buildLineItem("Long-term Liabilities", longTermLiabilitiesSeries),
    equity: buildLineItem("Total Equity", equitySeries, filterByCategory(accounts, "equity")),
    workingCapital: seriesToArray(workingCapitalSeries),
    currentRatio: currentRatioFixed,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sumByCategory(accounts: AccountData[], category: AccountCategory): MonthlySeries {
  let total: MonthlySeries = new Map();
  for (const account of accounts) {
    if (account.category === category) {
      total = addSeries(total, account.values);
    }
  }
  return total;
}

function filterByCategory(accounts: AccountData[], category: AccountCategory): AccountData[] {
  return accounts.filter((a) => a.category === category);
}

function buildLineItem(
  name: string,
  total: MonthlySeries,
  childAccounts?: AccountData[]
): StatementLineItem {
  const item: StatementLineItem = {
    name,
    values: seriesToArray(total),
  };

  if (childAccounts && childAccounts.length > 0) {
    item.children = childAccounts.map((a) => ({
      name: a.name,
      values: seriesToArray(a.values),
    }));
  }

  return item;
}

function computeMargin(
  numerator: MonthlySeries,
  denominator: MonthlySeries
): { month: string; value: number }[] {
  const result: { month: string; value: number }[] = [];
  const sortedKeys = Array.from(
    new Set([...numerator.keys(), ...denominator.keys()])
  ).sort();

  for (const key of sortedKeys) {
    const num = D(numerator.get(key) ?? 0);
    const den = D(denominator.get(key) ?? 0);
    result.push({
      month: key,
      value: den.isZero() ? 0 : dRound2(num.div(den).mul(100)),
    });
  }

  return result;
}

function cumulativeSeries(
  changes: MonthlySeries,
  startingBalance: number
): MonthlySeries {
  const result: MonthlySeries = new Map();
  let running = D(startingBalance);

  const sortedKeys = Array.from(changes.keys()).sort();
  for (const key of sortedKeys) {
    running = running.plus(changes.get(key) ?? 0);
    result.set(key, dRound2(running));
  }

  return result;
}
