/**
 * Executes AI tool calls against the database. Maps tool names from
 * @burnless/ai to actual DB mutations and engine computations.
 */

import { db } from "@burnless/db";
import {
  scenarios,
  forecastLines,
  headcountPlans,
  revenueStreams,
  fundingRounds,
  financialAccounts,
  departments,
  transactions,
} from "@burnless/db";
import { eq } from "drizzle-orm";
import { computeDashboardData } from "./compute-dashboard";
import { seriesToArray } from "@burnless/engine";

interface ToolContext {
  companyId: string;
  scenarioId: string;
  userId: string;
}

/** Sum all values in a StatementLineItem's values array. */
function sumValues(values: Array<{ month: string; value: number }>): number {
  return values.reduce((sum, v) => sum + v.value, 0);
}

/** Get latest value from a MetricValue array. */
function latest(arr: Array<{ month: string; value: number }> | undefined): number | null {
  if (!arr || arr.length === 0) return null;
  return arr[arr.length - 1]!.value;
}

/** Execute a tool call and return a string result for the AI. */
export async function executeToolCall(
  toolName: string,
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  switch (toolName) {
    case "create_scenario":
      return createScenario(input, context);
    case "create_forecast_line":
      return createForecastLine(input, context);
    case "add_headcount":
      return addHeadcount(input, context);
    case "add_revenue_stream":
      return addRevenueStream(input, context);
    case "compare_scenarios":
      return compareScenariosTool(input, context);
    case "compute_metrics":
      return computeMetrics(input, context);
    case "generate_financial_statements":
      return generateStatements(input, context);
    case "add_funding_round":
      return addFundingRound(input, context);
    case "create_account":
      return createAccount(input, context);
    case "create_department":
      return createDepartment(input, context);
    case "categorize_transactions":
      return categorizeTransactions(input, context);
    case "generate_report_narrative":
      return generateReportNarrative(input, context);
    case "suggest_cost_cuts":
      return suggestCostCuts(input, context);
    case "benchmark_metrics":
      return benchmarkMetrics(input, context);
    case "model_dilution":
      return modelDilution(input, context);
    case "forecast_revenue":
      return forecastRevenue(input, context);
    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

async function createScenario(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const [row] = await db
    .insert(scenarios)
    .values({
      companyId: context.companyId,
      name: input.name as string,
      type: input.type as "base" | "best" | "worst" | "custom",
      description: (input.description as string) ?? null,
    })
    .returning();

  return JSON.stringify({
    success: true,
    scenarioId: row!.id,
    message: `Created scenario "${row!.name}" (${row!.type}). ID: ${row!.id}`,
  });
}

async function createForecastLine(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const scenarioId = (input.scenarioId as string) || context.scenarioId;

  const [row] = await db
    .insert(forecastLines)
    .values({
      scenarioId,
      accountId: input.accountId as string,
      method: input.method as "fixed" | "growth_rate" | "per_unit" | "percentage_of" | "custom_formula",
      parameters: input.parameters as Record<string, unknown>,
      startDate: new Date(input.startDate as string),
      endDate: input.endDate ? new Date(input.endDate as string) : null,
    })
    .returning();

  return JSON.stringify({
    success: true,
    forecastLineId: row!.id,
    message: `Created forecast line for account ${input.accountId} using ${input.method} method.`,
  });
}

async function addHeadcount(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const scenarioId = (input.scenarioId as string) || context.scenarioId;

  const [row] = await db
    .insert(headcountPlans)
    .values({
      scenarioId,
      departmentId: input.departmentId as string,
      title: input.title as string,
      count: input.count as number,
      salary: String(input.salary),
      startDate: new Date(input.startDate as string),
      endDate: input.endDate ? new Date(input.endDate as string) : null,
      benefitsRate: String((input.benefitsRate as number) ?? 0.2),
    })
    .returning();

  const totalCost = (input.count as number) * (input.salary as number) * (1 + ((input.benefitsRate as number) ?? 0.2));

  return JSON.stringify({
    success: true,
    headcountPlanId: row!.id,
    message: `Added ${input.count}x ${input.title} at $${(input.salary as number).toLocaleString()}/year each. Total annual cost: $${totalCost.toLocaleString()} (including benefits).`,
  });
}

async function addRevenueStream(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const scenarioId = (input.scenarioId as string) || context.scenarioId;

  const [row] = await db
    .insert(revenueStreams)
    .values({
      scenarioId,
      name: input.name as string,
      type: input.type as "subscription" | "one_time" | "usage_based" | "services",
      parameters: input.parameters as Record<string, unknown>,
    })
    .returning();

  return JSON.stringify({
    success: true,
    revenueStreamId: row!.id,
    message: `Created revenue stream "${input.name}" (${input.type}).`,
  });
}

async function compareScenariosTool(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const baseId = input.baseScenarioId as string;
  const compareId = input.compareScenarioId as string;

  const [baseDash, compareDash] = await Promise.all([
    computeDashboardData(context.companyId, baseId),
    computeDashboardData(context.companyId, compareId),
  ]);

  const basePnL = baseDash.profitAndLoss;
  const comparePnL = compareDash.profitAndLoss;

  return JSON.stringify({
    success: true,
    comparison: {
      baseTotalRevenue: sumValues(basePnL.revenue.values),
      compareTotalRevenue: sumValues(comparePnL.revenue.values),
      baseTotalExpenses: sumValues(basePnL.cogs.values) + sumValues(basePnL.operatingExpenses.values),
      compareTotalExpenses: sumValues(comparePnL.cogs.values) + sumValues(comparePnL.operatingExpenses.values),
      baseNetIncome: sumValues(basePnL.netIncome.values),
      compareNetIncome: sumValues(comparePnL.netIncome.values),
      baseStartingCash: baseDash.startingCash,
      compareStartingCash: compareDash.startingCash,
    },
  });
}

async function computeMetrics(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const scenarioId = (input.scenarioId as string) || context.scenarioId;
  const dashboard = await computeDashboardData(context.companyId, scenarioId);

  const m = dashboard.metrics;

  return JSON.stringify({
    success: true,
    metrics: {
      mrr: latest(m.mrr),
      arr: latest(m.arr),
      burnRate: latest(m.burnRate),
      netBurn: latest(m.netBurnRate),
      runway: latest(m.cashRunwayMonths),
      cashPosition: latest(m.cashPosition),
      revenueGrowth: latest(m.revenueGrowthRate),
      grossMargin: latest(m.grossMarginPercent),
      ltv: latest(m.ltv),
      cac: latest(m.cac),
      ltvCacRatio: latest(m.ltvCacRatio),
      churnRate: latest(m.customerChurnRate),
      burnMultiple: latest(m.burnMultiple),
      ruleOf40: latest(m.ruleOf40),
      magicNumber: latest(m.magicNumber),
    },
    profitAndLoss: {
      totalRevenue: sumValues(dashboard.profitAndLoss.revenue.values),
      totalCogs: sumValues(dashboard.profitAndLoss.cogs.values),
      grossProfit: sumValues(dashboard.profitAndLoss.grossProfit.values),
      totalOpex: sumValues(dashboard.profitAndLoss.operatingExpenses.values),
      netIncome: sumValues(dashboard.profitAndLoss.netIncome.values),
    },
  });
}

async function generateStatements(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const scenarioId = (input.scenarioId as string) || context.scenarioId;
  const dashboard = await computeDashboardData(context.companyId, scenarioId);

  const pnl = dashboard.profitAndLoss;

  return JSON.stringify({
    success: true,
    profitAndLoss: {
      revenue: sumValues(pnl.revenue.values),
      cogs: sumValues(pnl.cogs.values),
      grossProfit: sumValues(pnl.grossProfit.values),
      operatingExpenses: sumValues(pnl.operatingExpenses.values),
      operatingIncome: sumValues(pnl.operatingIncome.values),
      netIncome: sumValues(pnl.netIncome.values),
    },
    cashFlow: {
      operatingCash: sumValues(dashboard.cashFlow.operatingCashFlow.values),
      endingCash: dashboard.cashFlow.endingCash.length > 0
        ? dashboard.cashFlow.endingCash[dashboard.cashFlow.endingCash.length - 1]!.value
        : 0,
    },
  });
}

async function addFundingRound(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const [row] = await db
    .insert(fundingRounds)
    .values({
      companyId: context.companyId,
      name: input.name as string,
      type: input.type as "pre_seed" | "seed" | "series_a" | "series_b" | "series_c_plus" | "debt" | "grant",
      amount: String(input.amount),
      date: new Date(input.date as string),
      preMoneyValuation: input.preMoneyValuation ? String(input.preMoneyValuation) : null,
      dilutionPercent: input.dilutionPercent ? String(input.dilutionPercent) : null,
      isProjected: (input.isProjected as boolean) ?? true,
    })
    .returning();

  return JSON.stringify({
    success: true,
    fundingRoundId: row!.id,
    message: `Added ${input.name} funding round: $${(input.amount as number).toLocaleString()} on ${input.date}.`,
  });
}

async function createAccount(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const [row] = await db
    .insert(financialAccounts)
    .values({
      companyId: context.companyId,
      name: input.name as string,
      type: input.type as "income" | "expense" | "asset" | "liability" | "equity",
      category: input.category as "revenue" | "cogs" | "operating_expense" | "other_income" | "other_expense" | "asset" | "liability" | "equity",
    })
    .returning();

  return JSON.stringify({
    success: true,
    accountId: row!.id,
    message: `Created account "${input.name}" (${input.category}). ID: ${row!.id}`,
  });
}

async function createDepartment(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const [row] = await db
    .insert(departments)
    .values({
      companyId: context.companyId,
      name: input.name as string,
    })
    .returning();

  return JSON.stringify({
    success: true,
    departmentId: row!.id,
    message: `Created department "${input.name}". ID: ${row!.id}`,
  });
}

// ── New analysis tools ──────────────────────────────────────────────────────

async function categorizeTransactions(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  // Fetch existing accounts for category matching
  const accounts = await db
    .select()
    .from(financialAccounts)
    .where(eq(financialAccounts.companyId, context.companyId));

  const txns = input.transactions as Array<{
    id?: string;
    description: string;
    amount: number;
    date?: string;
  }>;

  // Build category map from existing accounts
  const categoryMap = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    category: a.category,
  }));

  // Return transaction data + available categories for AI to match
  return JSON.stringify({
    success: true,
    transactions: txns.map((t) => ({
      id: t.id ?? null,
      description: t.description,
      amount: t.amount,
      date: t.date ?? null,
    })),
    availableAccounts: categoryMap,
    message: `Analyzed ${txns.length} transactions against ${accounts.length} accounts. Suggest categories based on description patterns.`,
  });
}

async function generateReportNarrative(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const dashboard = await computeDashboardData(context.companyId, context.scenarioId);

  const m = dashboard.metrics;
  const pnl = dashboard.profitAndLoss;

  // Compute month-over-month trends for narrative context
  const revArray = seriesToArray(dashboard.totalRevenue);
  const expArray = seriesToArray(dashboard.totalExpenses);
  const cashArray = seriesToArray(dashboard.cashPosition);

  const recentRevenue = revArray.slice(-3);
  const recentExpenses = expArray.slice(-3);
  const recentCash = cashArray.slice(-3);

  const revGrowth =
    recentRevenue.length >= 2 && recentRevenue[recentRevenue.length - 2]!.value > 0
      ? (recentRevenue[recentRevenue.length - 1]!.value - recentRevenue[recentRevenue.length - 2]!.value) /
        recentRevenue[recentRevenue.length - 2]!.value
      : null;

  return JSON.stringify({
    success: true,
    reportType: input.reportType as string,
    tone: (input.tone as string) ?? "formal",
    highlights: (input.highlights as string[]) ?? [],
    financialData: {
      metrics: {
        mrr: latest(m.mrr),
        arr: latest(m.arr),
        burnRate: latest(m.burnRate),
        netBurn: latest(m.netBurnRate),
        runway: latest(m.cashRunwayMonths),
        cashPosition: latest(m.cashPosition),
        revenueGrowth: latest(m.revenueGrowthRate),
        grossMargin: latest(m.grossMarginPercent),
      },
      profitAndLoss: {
        totalRevenue: sumValues(pnl.revenue.values),
        totalCogs: sumValues(pnl.cogs.values),
        grossProfit: sumValues(pnl.grossProfit.values),
        totalOpex: sumValues(pnl.operatingExpenses.values),
        netIncome: sumValues(pnl.netIncome.values),
      },
      trends: {
        revenueMonthOverMonth: revGrowth,
        recentRevenue: recentRevenue.map((v) => ({ month: v.month, value: v.value })),
        recentExpenses: recentExpenses.map((v) => ({ month: v.month, value: v.value })),
        recentCash: recentCash.map((v) => ({ month: v.month, value: v.value })),
      },
    },
    message: `Financial data assembled for ${input.reportType} report. Generate the narrative based on this data.`,
  });
}

async function suggestCostCuts(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const scenarioId = (input.scenarioId as string) || context.scenarioId;
  const dashboard = await computeDashboardData(context.companyId, scenarioId);

  const excludeCategories = (input.excludeCategories as string[]) ?? [];
  const targetSavingsPercent = input.targetSavingsPercent as number | undefined;

  // Get expense accounts with their forecast amounts
  const accounts = await db
    .select()
    .from(financialAccounts)
    .where(eq(financialAccounts.companyId, context.companyId));

  const expenseAccounts = accounts.filter(
    (a) =>
      (a.type === "expense" || a.category === "operating_expense" || a.category === "cogs") &&
      !excludeCategories.includes(a.category)
  );

  const totalExpenses = sumValues(dashboard.profitAndLoss.operatingExpenses.values) +
    sumValues(dashboard.profitAndLoss.cogs.values);

  const monthlyBurn = latest(dashboard.metrics.burnRate) ?? 0;
  const runway = latest(dashboard.metrics.cashRunwayMonths);

  return JSON.stringify({
    success: true,
    currentState: {
      totalAnnualExpenses: totalExpenses,
      monthlyBurn,
      runway,
      cashPosition: latest(dashboard.metrics.cashPosition),
    },
    expenseBreakdown: expenseAccounts.map((a) => ({
      id: a.id,
      name: a.name,
      category: a.category,
    })),
    targetSavingsPercent: targetSavingsPercent ?? null,
    profitAndLoss: {
      cogs: sumValues(dashboard.profitAndLoss.cogs.values),
      opex: sumValues(dashboard.profitAndLoss.operatingExpenses.values),
      grossProfit: sumValues(dashboard.profitAndLoss.grossProfit.values),
    },
    message: `Expense analysis complete. Total annual expenses: ${totalExpenses}. Identify cost reduction opportunities from the expense breakdown.`,
  });
}

/** Industry benchmarks by stage — curated from SaaS industry data. */
const BENCHMARKS: Record<string, Record<string, { median: number; top25: number; bottom25: number; unit: string }>> = {
  seed: {
    burn_rate: { median: 75000, top25: 50000, bottom25: 120000, unit: "$/month" },
    runway: { median: 18, top25: 24, bottom25: 12, unit: "months" },
    revenue_growth: { median: 0.15, top25: 0.25, bottom25: 0.05, unit: "MoM %" },
    gross_margin: { median: 0.70, top25: 0.85, bottom25: 0.50, unit: "%" },
    ltv_cac_ratio: { median: 2.5, top25: 4.0, bottom25: 1.5, unit: "x" },
    churn_rate: { median: 0.05, top25: 0.02, bottom25: 0.10, unit: "monthly %" },
    burn_multiple: { median: 3.0, top25: 1.5, bottom25: 6.0, unit: "x" },
    rule_of_40: { median: 15, top25: 40, bottom25: -10, unit: "%" },
    magic_number: { median: 0.5, top25: 0.8, bottom25: 0.2, unit: "x" },
  },
  series_a: {
    burn_rate: { median: 200000, top25: 150000, bottom25: 350000, unit: "$/month" },
    runway: { median: 20, top25: 30, bottom25: 14, unit: "months" },
    revenue_growth: { median: 0.12, top25: 0.20, bottom25: 0.05, unit: "MoM %" },
    gross_margin: { median: 0.72, top25: 0.85, bottom25: 0.55, unit: "%" },
    ltv_cac_ratio: { median: 3.0, top25: 5.0, bottom25: 2.0, unit: "x" },
    churn_rate: { median: 0.04, top25: 0.015, bottom25: 0.08, unit: "monthly %" },
    burn_multiple: { median: 2.0, top25: 1.0, bottom25: 4.0, unit: "x" },
    rule_of_40: { median: 25, top25: 50, bottom25: 0, unit: "%" },
    magic_number: { median: 0.7, top25: 1.0, bottom25: 0.3, unit: "x" },
  },
  series_b: {
    burn_rate: { median: 500000, top25: 350000, bottom25: 800000, unit: "$/month" },
    runway: { median: 24, top25: 36, bottom25: 16, unit: "months" },
    revenue_growth: { median: 0.08, top25: 0.15, bottom25: 0.03, unit: "MoM %" },
    gross_margin: { median: 0.75, top25: 0.88, bottom25: 0.60, unit: "%" },
    ltv_cac_ratio: { median: 3.5, top25: 6.0, bottom25: 2.5, unit: "x" },
    churn_rate: { median: 0.03, top25: 0.01, bottom25: 0.06, unit: "monthly %" },
    burn_multiple: { median: 1.5, top25: 0.8, bottom25: 3.0, unit: "x" },
    rule_of_40: { median: 35, top25: 60, bottom25: 10, unit: "%" },
    magic_number: { median: 0.8, top25: 1.2, bottom25: 0.4, unit: "x" },
  },
};

async function benchmarkMetrics(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const dashboard = await computeDashboardData(context.companyId, context.scenarioId);
  const m = dashboard.metrics;

  // Determine stage
  const stage = (input.stage as string) ?? "seed";
  const benchmarkStage = BENCHMARKS[stage] ?? BENCHMARKS["seed"]!;

  // Company's actual metrics
  const actual: Record<string, number | null> = {
    burn_rate: latest(m.burnRate),
    runway: latest(m.cashRunwayMonths),
    revenue_growth: latest(m.revenueGrowthRate),
    gross_margin: latest(m.grossMarginPercent),
    ltv_cac_ratio: latest(m.ltvCacRatio),
    churn_rate: latest(m.customerChurnRate),
    burn_multiple: latest(m.burnMultiple),
    rule_of_40: latest(m.ruleOf40),
    magic_number: latest(m.magicNumber),
  };

  const requestedMetrics = (input.metrics as string[]) ?? Object.keys(benchmarkStage);

  const results = requestedMetrics
    .filter((name) => benchmarkStage[name])
    .map((name) => {
      const bench = benchmarkStage[name]!;
      const value = actual[name] ?? null;
      let rating: "above" | "at" | "below" | "unknown" = "unknown";

      if (value !== null) {
        // For metrics where lower is better (burn_rate, churn_rate, burn_multiple)
        const lowerIsBetter = ["burn_rate", "churn_rate", "burn_multiple"].includes(name);
        if (lowerIsBetter) {
          rating = value <= bench.top25 ? "above" : value <= bench.median ? "at" : "below";
        } else {
          rating = value >= bench.top25 ? "above" : value >= bench.median ? "at" : "below";
        }
      }

      return {
        metric: name,
        actual: value,
        benchmark: bench,
        rating,
      };
    });

  return JSON.stringify({
    success: true,
    stage,
    benchmarks: results,
    message: `Benchmarked ${results.length} metrics against ${stage}-stage companies.`,
  });
}

async function modelDilution(
  input: Record<string, unknown>,
  _context: ToolContext
): Promise<string> {
  const roundAmount = input.roundAmount as number;
  const preMoneyValuation = input.preMoneyValuation as number;
  const existingOwnership = (input.existingOwnershipPercent as number) ?? 1.0;
  const optionPool = (input.optionPoolPercent as number) ?? 0;

  const postMoneyValuation = preMoneyValuation + roundAmount;
  const newInvestorOwnership = roundAmount / postMoneyValuation;
  const optionPoolOwnership = optionPool;

  // After round, existing shareholders get diluted
  const founderPostRound = existingOwnership * (1 - newInvestorOwnership - optionPoolOwnership);

  // Build cap table
  const capTable = {
    preRound: {
      founders: existingOwnership,
      previousInvestors: 1.0 - existingOwnership,
    },
    postRound: {
      founders: founderPostRound,
      previousInvestors: (1.0 - existingOwnership) * (1 - newInvestorOwnership - optionPoolOwnership),
      newInvestor: newInvestorOwnership,
      optionPool: optionPoolOwnership,
    },
    dilution: {
      founderDilution: existingOwnership - founderPostRound,
      founderDilutionPercent: (existingOwnership - founderPostRound) / existingOwnership,
    },
  };

  // Model existing rounds context
  const existingRounds = (input.existingRounds as Array<{ name: string; amount: number; ownership: number }>) ?? [];

  return JSON.stringify({
    success: true,
    roundDetails: {
      roundAmount,
      preMoneyValuation,
      postMoneyValuation,
      pricePerPercent: preMoneyValuation / 100,
    },
    capTable,
    existingRounds,
    message: `Modeled dilution for $${roundAmount.toLocaleString()} round at $${preMoneyValuation.toLocaleString()} pre-money. Founders diluted from ${(existingOwnership * 100).toFixed(1)}% to ${(founderPostRound * 100).toFixed(1)}%.`,
  });
}

async function forecastRevenue(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const scenarioId = (input.scenarioId as string) || context.scenarioId;
  const months = Math.min(Math.max((input.months as number) ?? 12, 1), 36);
  const method = (input.method as string) ?? "auto";
  const includeCI = (input.includeConfidenceIntervals as boolean) ?? true;

  const dashboard = await computeDashboardData(context.companyId, scenarioId);
  const revArray = seriesToArray(dashboard.totalRevenue);

  if (revArray.length < 2) {
    return JSON.stringify({
      success: false,
      message: "Need at least 2 months of revenue data to forecast. Add more historical data.",
    });
  }

  const values = revArray.map((v) => v.value);
  const n = values.length;

  // Calculate growth rates for method selection
  const growthRates: number[] = [];
  for (let i = 1; i < n; i++) {
    if (values[i - 1]! > 0) {
      growthRates.push((values[i]! - values[i - 1]!) / values[i - 1]!);
    }
  }
  const avgGrowth = growthRates.length > 0 ? growthRates.reduce((a, b) => a + b, 0) / growthRates.length : 0;
  const lastValue = values[n - 1]!;

  // Auto-select method
  const effectiveMethod =
    method === "auto"
      ? avgGrowth > 0.1
        ? "exponential"
        : avgGrowth > 0
          ? "linear"
          : "conservative"
      : method;

  // Linear regression for linear method
  const sumX = values.reduce((acc, _, i) => acc + i, 0);
  const sumY = values.reduce((acc, v) => acc + v, 0);
  const sumXY = values.reduce((acc, v, i) => acc + i * v, 0);
  const sumX2 = values.reduce((acc, _, i) => acc + i * i, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // Standard deviation for confidence intervals
  const residuals = values.map((v, i) => v - (intercept + slope * i));
  const stdDev = Math.sqrt(residuals.reduce((acc, r) => acc + r * r, 0) / Math.max(n - 2, 1));

  // Generate forecasts
  const lastMonth = revArray[n - 1]!.month;
  const [yearStr, monthStr] = lastMonth.split("-");
  let forecastYear = parseInt(yearStr!);
  let forecastMonth = parseInt(monthStr!);

  const forecast: Array<{
    month: string;
    projected: number;
    low: number | null;
    high: number | null;
  }> = [];

  for (let i = 1; i <= months; i++) {
    forecastMonth++;
    if (forecastMonth > 12) {
      forecastMonth = 1;
      forecastYear++;
    }
    const monthKey = `${forecastYear}-${String(forecastMonth).padStart(2, "0")}`;

    let projected: number;
    switch (effectiveMethod) {
      case "exponential":
        projected = lastValue * Math.pow(1 + avgGrowth, i);
        break;
      case "conservative":
        projected = lastValue * Math.pow(1 + avgGrowth * 0.5, i);
        break;
      case "linear":
      default:
        projected = intercept + slope * (n - 1 + i);
        break;
    }

    projected = Math.max(0, projected);

    const ci = includeCI ? stdDev * 1.96 * Math.sqrt(1 + i / n) : 0;
    forecast.push({
      month: monthKey,
      projected: Math.round(projected),
      low: includeCI ? Math.round(Math.max(0, projected - ci)) : null,
      high: includeCI ? Math.round(projected + ci) : null,
    });
  }

  return JSON.stringify({
    success: true,
    method: effectiveMethod,
    historicalMonths: n,
    averageGrowthRate: avgGrowth,
    lastMonthRevenue: lastValue,
    forecast,
    summary: {
      month12Revenue: forecast[Math.min(11, forecast.length - 1)]?.projected ?? null,
      totalProjectedRevenue: forecast.reduce((sum, f) => sum + f.projected, 0),
      projectedGrowthRate: forecast.length > 0 && lastValue > 0
        ? (forecast[forecast.length - 1]!.projected - lastValue) / lastValue
        : null,
    },
    message: `Projected ${months} months of revenue using ${effectiveMethod} method. Average historical growth: ${(avgGrowth * 100).toFixed(1)}%/month.`,
  });
}
