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
  liabilities: StatementLineItem;
  equity: StatementLineItem;
}

// ── P&L Generation ───────────────────────────────────────────────────────────

/** Generate a P&L statement from account-level data. */
export function generateProfitAndLoss(accounts: AccountData[]): ProfitAndLoss {
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

  return {
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
}

// ── Cash Flow Generation ─────────────────────────────────────────────────────

/**
 * Generate a cash flow statement.
 * For a projection model, operating CF ≈ net income (simplified).
 * Investing and financing CFs come from asset/liability/equity accounts.
 */
export function generateCashFlow(
  accounts: AccountData[],
  startingCash: number = 0,
  fundingInflows?: MonthlySeries
): CashFlowStatement {
  // Operating: net income proxy (revenue - cogs - opex + other income - other expense)
  const revenue = sumByCategory(accounts, "revenue");
  const cogs = sumByCategory(accounts, "cogs");
  const opex = sumByCategory(accounts, "operating_expense");
  const otherIncome = sumByCategory(accounts, "other_income");
  const otherExpense = sumByCategory(accounts, "other_expense");

  const operatingCF = subtractSeries(
    addSeries(subtractSeries(revenue, cogs), otherIncome),
    addSeries(opex, otherExpense)
  );

  // Investing: asset purchases (negative = cash outflow)
  const assetChanges = sumByCategory(accounts, "asset");
  const investingCF = subtractSeries(new Map(), assetChanges); // negate: asset increase = cash outflow

  // Financing: liability changes + equity changes + funding
  const liabilityChanges = sumByCategory(accounts, "liability");
  const equityChanges = sumByCategory(accounts, "equity");
  let financingCF = addSeries(liabilityChanges, equityChanges);
  if (fundingInflows) {
    financingCF = addSeries(financingCF, fundingInflows);
  }

  const netCashChange = addSeries(addSeries(operatingCF, investingCF), financingCF);

  // Cumulative ending cash
  const endingCash = cumulativeSeries(netCashChange, startingCash);

  return {
    operatingCashFlow: buildLineItem("Operating Cash Flow", operatingCF),
    investingCashFlow: buildLineItem("Investing Cash Flow", investingCF),
    financingCashFlow: buildLineItem("Financing Cash Flow", financingCF),
    netCashChange: buildLineItem("Net Cash Change", netCashChange),
    endingCash: seriesToArray(endingCash),
  };
}

// ── Balance Sheet Generation ─────────────────────────────────────────────────

/** Generate a balance sheet from account-level data. */
export function generateBalanceSheet(accounts: AccountData[]): BalanceSheet {
  const assetSeries = sumByCategory(accounts, "asset");
  const liabilitySeries = sumByCategory(accounts, "liability");
  const equitySeries = sumByCategory(accounts, "equity");

  return {
    assets: buildLineItem("Total Assets", assetSeries, filterByCategory(accounts, "asset")),
    liabilities: buildLineItem("Total Liabilities", liabilitySeries, filterByCategory(accounts, "liability")),
    equity: buildLineItem("Total Equity", equitySeries, filterByCategory(accounts, "equity")),
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
