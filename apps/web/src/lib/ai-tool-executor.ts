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
} from "@burnless/db";
import { computeDashboardData } from "./compute-dashboard";

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
