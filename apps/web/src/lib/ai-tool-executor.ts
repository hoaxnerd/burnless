/**
 * Executes AI tool calls against the database. Maps tool names from
 * @burnless/ai to actual DB mutations and engine computations.
 *
 * All tool inputs are validated with Zod schemas before execution to
 * prevent data corruption from malformed LLM outputs (BUR-121).
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
  aiToolAuditLogs,
} from "@burnless/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { computeDashboardData } from "./compute-dashboard";
import { seriesToArray } from "@burnless/engine";

interface ToolContext {
  companyId: string;
  scenarioId: string;
  userId: string;
  conversationId?: string;
}

// ── Validation helpers ──────────────────────────────────────────────────────

/** Safely name strings — non-empty, bounded length. */
const nameString = z.string().min(1, "Name is required").max(200, "Name too long (max 200 chars)");

/** Optional description string, bounded length. */
const descriptionString = z.string().max(2000, "Description too long").optional().nullable();

/** UUID or cuid-style identifier. */
const idString = z.string().min(1, "ID is required").max(100);

/** Optional ID — falls back to context. */
const optionalId = z.string().min(1).max(100).optional();

/** Financial amount — must be non-negative, capped at $100B to prevent absurd values. */
const financialAmount = z.number().nonnegative("Amount must be >= 0").max(100_000_000_000, "Amount exceeds $100B limit");

/** Growth/interest rate — bounded between -100% and 10,000% (100x). */
const rateValue = z.number().min(-1, "Rate cannot be below -100%").max(100, "Rate cannot exceed 10,000%");

/** Percentage 0-1 range. */
const percentFraction = z.number().min(0, "Percentage must be >= 0").max(1, "Percentage must be <= 100%");

/** Headcount — positive integer, bounded. */
const headcount = z.number().int("Count must be a whole number").min(1, "Count must be >= 1").max(100_000, "Count exceeds 100,000 limit");

/** Salary — positive, bounded. */
const salaryAmount = z.number().positive("Salary must be > 0").max(100_000_000, "Salary exceeds $100M limit");

/** Benefits rate — 0 to 200% (some roles have very high benefits). */
const benefitsRate = z.number().min(0, "Benefits rate must be >= 0").max(2, "Benefits rate cannot exceed 200%").default(0.2);

/** ISO date string (YYYY-MM-DD or full ISO). */
const dateString = z.string().min(1, "Date is required").refine(
  (v) => !isNaN(Date.parse(v)),
  "Invalid date format"
);

/** Optional date string. */
const optionalDate = z.string().refine((v) => !isNaN(Date.parse(v)), "Invalid date format").optional().nullable();

/** Month count — positive integer, bounded. */
const monthCount = z.number().int().min(1, "Months must be >= 1").max(120, "Cannot forecast more than 10 years").default(12);

// ── Tool input schemas ──────────────────────────────────────────────────────

const createScenarioSchema = z.object({
  name: nameString,
  type: z.enum(["base", "best", "worst", "custom"]),
  description: descriptionString,
});

const createForecastLineSchema = z.object({
  scenarioId: optionalId,
  accountId: idString,
  method: z.enum(["fixed", "growth_rate", "per_unit", "percentage_of", "custom_formula"]),
  parameters: z.record(z.unknown()).default({}),
  startDate: dateString,
  endDate: optionalDate,
});

const addHeadcountSchema = z.object({
  scenarioId: optionalId,
  departmentId: idString,
  title: nameString,
  count: headcount,
  salary: salaryAmount,
  startDate: dateString,
  endDate: optionalDate,
  benefitsRate: benefitsRate,
});

const addRevenueStreamSchema = z.object({
  scenarioId: optionalId,
  name: nameString,
  type: z.enum(["subscription", "one_time", "usage_based", "services"]),
  parameters: z.record(z.unknown()).default({}),
});

const compareScenarioSchema = z.object({
  baseScenarioId: idString,
  compareScenarioId: idString,
});

const computeMetricsSchema = z.object({
  scenarioId: optionalId,
});

const generateStatementsSchema = z.object({
  scenarioId: optionalId,
});

const addFundingRoundSchema = z.object({
  name: nameString,
  type: z.enum(["pre_seed", "seed", "series_a", "series_b", "series_c_plus", "debt", "grant"]),
  amount: financialAmount.refine((v) => v > 0, "Funding amount must be > 0"),
  date: dateString,
  preMoneyValuation: financialAmount.optional().nullable(),
  dilutionPercent: percentFraction.optional().nullable(),
  isProjected: z.boolean().default(true),
});

const createAccountSchema = z.object({
  name: nameString,
  type: z.enum(["income", "expense", "asset", "liability", "equity"]),
  category: z.enum(["revenue", "cogs", "operating_expense", "other_income", "other_expense", "asset", "liability", "equity"]),
});

const createDepartmentSchema = z.object({
  name: nameString,
});

const categorizeTransactionsSchema = z.object({
  transactions: z.array(z.object({
    id: z.string().optional(),
    description: z.string().min(1).max(500),
    amount: z.number(),
    date: z.string().optional(),
  })).min(1, "At least one transaction required").max(1000, "Too many transactions (max 1000)"),
});

const generateReportNarrativeSchema = z.object({
  reportType: z.string().min(1).max(100),
  tone: z.string().max(50).default("formal"),
  highlights: z.array(z.string().max(500)).max(20).default([]),
});

const suggestCostCutsSchema = z.object({
  scenarioId: optionalId,
  excludeCategories: z.array(z.string()).max(50).default([]),
  targetSavingsPercent: z.number().min(0).max(1).optional(),
});

const benchmarkMetricsSchema = z.object({
  stage: z.enum(["seed", "series_a", "series_b"]).default("seed"),
  metrics: z.array(z.string()).optional(),
});

const modelDilutionSchema = z.object({
  roundAmount: financialAmount.refine((v) => v > 0, "Round amount must be > 0"),
  preMoneyValuation: financialAmount.refine((v) => v > 0, "Pre-money valuation must be > 0"),
  existingOwnershipPercent: percentFraction.default(1.0),
  optionPoolPercent: percentFraction.default(0),
  existingRounds: z.array(z.object({
    name: z.string(),
    amount: z.number(),
    ownership: z.number(),
  })).default([]),
});

const forecastRevenueSchema = z.object({
  scenarioId: optionalId,
  months: monthCount,
  method: z.enum(["auto", "linear", "exponential", "conservative"]).default("auto"),
  includeConfidenceIntervals: z.boolean().default(true),
});

/** Maps tool names to their Zod schemas. */
const toolSchemas: Record<string, z.ZodType> = {
  create_scenario: createScenarioSchema,
  create_forecast_line: createForecastLineSchema,
  add_headcount: addHeadcountSchema,
  add_revenue_stream: addRevenueStreamSchema,
  compare_scenarios: compareScenarioSchema,
  compute_metrics: computeMetricsSchema,
  generate_financial_statements: generateStatementsSchema,
  add_funding_round: addFundingRoundSchema,
  create_account: createAccountSchema,
  create_department: createDepartmentSchema,
  categorize_transactions: categorizeTransactionsSchema,
  generate_report_narrative: generateReportNarrativeSchema,
  suggest_cost_cuts: suggestCostCutsSchema,
  benchmark_metrics: benchmarkMetricsSchema,
  model_dilution: modelDilutionSchema,
  forecast_revenue: forecastRevenueSchema,
};

/** Validate tool input and return a structured error message if invalid. */
function validateToolInput(toolName: string, input: Record<string, unknown>): { success: true; data: Record<string, unknown> } | { success: false; error: string } {
  const schema = toolSchemas[toolName];
  if (!schema) {
    return { success: false, error: `Unknown tool: ${toolName}` };
  }
  const result = schema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`
    ).join("; ");
    return { success: false, error: `Invalid input for ${toolName}: ${issues}` };
  }
  return { success: true, data: result.data as Record<string, unknown> };
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

/** Log a tool call to the audit table. Fire-and-forget — never blocks the response. */
function logToolAudit(
  context: ToolContext,
  toolName: string,
  input: Record<string, unknown>,
  status: "success" | "error" | "validation_error",
  result: unknown,
  durationMs: number
) {
  db.insert(aiToolAuditLogs)
    .values({
      companyId: context.companyId,
      userId: context.userId,
      conversationId: context.conversationId ?? null,
      toolName,
      input,
      status,
      result: result as Record<string, unknown>,
      durationMs,
    })
    .catch((err) => {
      console.warn("[ai-tool-audit] Failed to log tool call:", err instanceof Error ? err.message : err);
    });
}

/** Execute a tool call and return a string result for the AI. */
export async function executeToolCall(
  toolName: string,
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const startTime = performance.now();

  // Validate input before execution
  const validation = validateToolInput(toolName, input);
  if (!validation.success) {
    const errorResult = { error: validation.error };
    logToolAudit(context, toolName, input, "validation_error", errorResult, Math.round(performance.now() - startTime));
    return JSON.stringify(errorResult);
  }
  const data = validation.data;

  let result: string;
  try {
    switch (toolName) {
      case "create_scenario":
        result = await createScenario(data, context);
        break;
      case "create_forecast_line":
        result = await createForecastLine(data, context);
        break;
      case "add_headcount":
        result = await addHeadcount(data, context);
        break;
      case "add_revenue_stream":
        result = await addRevenueStream(data, context);
        break;
      case "compare_scenarios":
        result = await compareScenariosTool(data, context);
        break;
      case "compute_metrics":
        result = await computeMetrics(data, context);
        break;
      case "generate_financial_statements":
        result = await generateStatements(data, context);
        break;
      case "add_funding_round":
        result = await addFundingRound(data, context);
        break;
      case "create_account":
        result = await createAccount(data, context);
        break;
      case "create_department":
        result = await createDepartment(data, context);
        break;
      case "categorize_transactions":
        result = await categorizeTransactions(data, context);
        break;
      case "generate_report_narrative":
        result = await generateReportNarrative(data, context);
        break;
      case "suggest_cost_cuts":
        result = await suggestCostCuts(data, context);
        break;
      case "benchmark_metrics":
        result = await benchmarkMetrics(data, context);
        break;
      case "model_dilution":
        result = await modelDilution(data, context);
        break;
      case "forecast_revenue":
        result = await forecastRevenue(data, context);
        break;
      default:
        result = JSON.stringify({ error: `Unknown tool: ${toolName}` });
        logToolAudit(context, toolName, input, "error", { error: `Unknown tool: ${toolName}` }, Math.round(performance.now() - startTime));
        return result;
    }
  } catch (err) {
    const durationMs = Math.round(performance.now() - startTime);
    const errorMsg = err instanceof Error ? err.message : String(err);
    logToolAudit(context, toolName, input, "error", { error: errorMsg }, durationMs);
    return JSON.stringify({ error: `Tool execution failed: ${errorMsg}` });
  }

  const durationMs = Math.round(performance.now() - startTime);
  let parsedResult: unknown;
  try {
    parsedResult = JSON.parse(result);
  } catch {
    parsedResult = { raw: result };
  }
  logToolAudit(context, toolName, input, "success", parsedResult, durationMs);

  return result;
}

async function createScenario(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const data = input as z.infer<typeof createScenarioSchema>;
  const [row] = await db
    .insert(scenarios)
    .values({
      companyId: context.companyId,
      name: data.name,
      type: data.type,
      description: data.description ?? null,
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
  const data = input as z.infer<typeof createForecastLineSchema>;
  const scenarioId = data.scenarioId || context.scenarioId;

  const [row] = await db
    .insert(forecastLines)
    .values({
      scenarioId,
      accountId: data.accountId,
      method: data.method,
      parameters: data.parameters,
      startDate: new Date(data.startDate),
      endDate: data.endDate ? new Date(data.endDate) : null,
    })
    .returning();

  return JSON.stringify({
    success: true,
    forecastLineId: row!.id,
    message: `Created forecast line for account ${data.accountId} using ${data.method} method.`,
  });
}

async function addHeadcount(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const data = input as z.infer<typeof addHeadcountSchema>;
  const scenarioId = data.scenarioId || context.scenarioId;

  const [row] = await db
    .insert(headcountPlans)
    .values({
      scenarioId,
      departmentId: data.departmentId,
      title: data.title,
      count: data.count,
      salary: String(data.salary),
      startDate: new Date(data.startDate),
      endDate: data.endDate ? new Date(data.endDate) : null,
      benefitsRate: String(data.benefitsRate),
    })
    .returning();

  const totalCost = data.count * data.salary * (1 + data.benefitsRate);

  return JSON.stringify({
    success: true,
    headcountPlanId: row!.id,
    message: `Added ${data.count}x ${data.title} at $${data.salary.toLocaleString()}/year each. Total annual cost: $${totalCost.toLocaleString()} (including benefits).`,
  });
}

async function addRevenueStream(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const data = input as z.infer<typeof addRevenueStreamSchema>;
  const scenarioId = data.scenarioId || context.scenarioId;

  const [row] = await db
    .insert(revenueStreams)
    .values({
      scenarioId,
      name: data.name,
      type: data.type,
      parameters: data.parameters,
    })
    .returning();

  return JSON.stringify({
    success: true,
    revenueStreamId: row!.id,
    message: `Created revenue stream "${data.name}" (${data.type}).`,
  });
}

async function compareScenariosTool(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const data = input as z.infer<typeof compareScenarioSchema>;
  const baseId = data.baseScenarioId;
  const compareId = data.compareScenarioId;

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
  const data = input as z.infer<typeof computeMetricsSchema>;
  const scenarioId = data.scenarioId || context.scenarioId;
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
  const data = input as z.infer<typeof generateStatementsSchema>;
  const scenarioId = data.scenarioId || context.scenarioId;
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
  const data = input as z.infer<typeof addFundingRoundSchema>;
  const [row] = await db
    .insert(fundingRounds)
    .values({
      companyId: context.companyId,
      name: data.name,
      type: data.type,
      amount: String(data.amount),
      date: new Date(data.date),
      preMoneyValuation: data.preMoneyValuation ? String(data.preMoneyValuation) : null,
      dilutionPercent: data.dilutionPercent ? String(data.dilutionPercent) : null,
      isProjected: data.isProjected,
    })
    .returning();

  return JSON.stringify({
    success: true,
    fundingRoundId: row!.id,
    message: `Added ${data.name} funding round: $${data.amount.toLocaleString()} on ${data.date}.`,
  });
}

async function createAccount(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const data = input as z.infer<typeof createAccountSchema>;
  const [row] = await db
    .insert(financialAccounts)
    .values({
      companyId: context.companyId,
      name: data.name,
      type: data.type,
      category: data.category,
    })
    .returning();

  return JSON.stringify({
    success: true,
    accountId: row!.id,
    message: `Created account "${data.name}" (${data.category}). ID: ${row!.id}`,
  });
}

async function createDepartment(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const data = input as z.infer<typeof createDepartmentSchema>;
  const [row] = await db
    .insert(departments)
    .values({
      companyId: context.companyId,
      name: data.name,
    })
    .returning();

  return JSON.stringify({
    success: true,
    departmentId: row!.id,
    message: `Created department "${data.name}". ID: ${row!.id}`,
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

  const data = input as z.infer<typeof categorizeTransactionsSchema>;
  const txns = data.transactions;

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
  const data = input as z.infer<typeof generateReportNarrativeSchema>;
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
    reportType: data.reportType,
    tone: data.tone,
    highlights: data.highlights,
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
    message: `Financial data assembled for ${data.reportType} report. Generate the narrative based on this data.`,
  });
}

async function suggestCostCuts(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const data = input as z.infer<typeof suggestCostCutsSchema>;
  const scenarioId = data.scenarioId || context.scenarioId;
  const dashboard = await computeDashboardData(context.companyId, scenarioId);

  const excludeCategories = data.excludeCategories;
  const targetSavingsPercent = data.targetSavingsPercent;

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
  const data = input as z.infer<typeof benchmarkMetricsSchema>;
  const dashboard = await computeDashboardData(context.companyId, context.scenarioId);
  const m = dashboard.metrics;

  // Determine stage
  const stage = data.stage;
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

  const requestedMetrics = data.metrics ?? Object.keys(benchmarkStage);

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
  const data = input as z.infer<typeof modelDilutionSchema>;
  const roundAmount = data.roundAmount;
  const preMoneyValuation = data.preMoneyValuation;
  const existingOwnership = data.existingOwnershipPercent;
  const optionPool = data.optionPoolPercent;

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
  const existingRounds = data.existingRounds;

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
  const data = input as z.infer<typeof forecastRevenueSchema>;
  const scenarioId = data.scenarioId || context.scenarioId;
  const months = Math.min(data.months, 36);
  const method = data.method;
  const includeCI = data.includeConfidenceIntervals;

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
