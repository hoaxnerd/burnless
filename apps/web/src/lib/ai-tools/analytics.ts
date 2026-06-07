/**
 * Analytics, metrics, benchmarking, transaction categorization,
 * report narratives, cost analysis, and account management tools.
 */

import { db } from "@burnless/db";
import { financialAccounts } from "@burnless/db";
import { mutateInsert, mutateUpdate, mutateDelete, planResultJson } from "./scenario-mutate";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { computeDashboardData } from "../compute-dashboard";
import { getDefaultScenario } from "../data";
import { seriesToArray } from "@burnless/engine";
import type { ToolContext, ToolHandler } from "./types";
import { nameString, idString, optionalId, sumValues, latest, requireCompanyId } from "./types";

// ── Schemas ──────────────────────────────────────────────────────────────────

export const computeMetricsSchema = z.object({
  scenarioId: optionalId,
});

export const createAccountSchema = z.object({
  name: nameString,
  type: z.enum(["income", "expense", "asset", "liability", "equity"]),
  category: z.enum(["revenue", "cogs", "operating_expense", "other_income", "other_expense", "asset", "liability", "equity"]),
  coversHeadcount: z.boolean().optional(),
});

export const updateAccountSchema = z.object({
  id: idString,
  name: nameString.optional(),
  type: z.enum(["income", "expense", "asset", "liability", "equity"]).optional(),
  category: z.enum(["revenue", "cogs", "operating_expense", "other_income", "other_expense", "asset", "liability", "equity"]).optional(),
});

export const deleteAccountSchema = z.object({
  id: idString,
});

export const categorizeTransactionsSchema = z.object({
  transactions: z.array(z.object({
    id: z.string().optional(),
    description: z.string().min(1).max(500),
    amount: z.number(),
    date: z.string().optional(),
  })).min(1, "At least one transaction required").max(1000, "Too many transactions (max 1000)"),
});

export const generateReportNarrativeSchema = z.object({
  reportType: z.string().min(1).max(100),
  tone: z.string().max(50).default("formal"),
  highlights: z.array(z.string().max(500)).max(20).default([]),
});

export const suggestCostCutsSchema = z.object({
  scenarioId: optionalId,
  excludeCategories: z.array(z.string()).max(50).default([]),
  targetSavingsPercent: z.number().min(0).max(1).optional(),
});

export const benchmarkMetricsSchema = z.object({
  stage: z.enum(["seed", "series_a", "series_b"]).default("seed"),
  metrics: z.array(z.string()).optional(),
});

// ── Industry benchmarks ──────────────────────────────────────────────────────

const BENCHMARKS: Record<string, Record<string, { median: number; top25: number; bottom25: number; unit: string }>> = {
  // All percentage benchmarks are in percentage points (e.g. 5 = 5%) to match engine output
  seed: {
    burn_rate: { median: 75000, top25: 50000, bottom25: 120000, unit: "$/month" },
    runway: { median: 18, top25: 24, bottom25: 12, unit: "months" },
    revenue_growth: { median: 15, top25: 25, bottom25: 5, unit: "MoM %" },
    gross_margin: { median: 70, top25: 85, bottom25: 50, unit: "%" },
    ltv_cac_ratio: { median: 2.5, top25: 4.0, bottom25: 1.5, unit: "x" },
    churn_rate: { median: 5, top25: 2, bottom25: 10, unit: "monthly %" },
    burn_multiple: { median: 3.0, top25: 1.5, bottom25: 6.0, unit: "x" },
    rule_of_40: { median: 15, top25: 40, bottom25: -10, unit: "%" },
    magic_number: { median: 0.5, top25: 0.8, bottom25: 0.2, unit: "x" },
  },
  series_a: {
    burn_rate: { median: 200000, top25: 150000, bottom25: 350000, unit: "$/month" },
    runway: { median: 20, top25: 30, bottom25: 14, unit: "months" },
    revenue_growth: { median: 12, top25: 20, bottom25: 5, unit: "MoM %" },
    gross_margin: { median: 72, top25: 85, bottom25: 55, unit: "%" },
    ltv_cac_ratio: { median: 3.0, top25: 5.0, bottom25: 2.0, unit: "x" },
    churn_rate: { median: 4, top25: 1.5, bottom25: 8, unit: "monthly %" },
    burn_multiple: { median: 2.0, top25: 1.0, bottom25: 4.0, unit: "x" },
    rule_of_40: { median: 25, top25: 50, bottom25: 0, unit: "%" },
    magic_number: { median: 0.7, top25: 1.0, bottom25: 0.3, unit: "x" },
  },
  series_b: {
    burn_rate: { median: 500000, top25: 350000, bottom25: 800000, unit: "$/month" },
    runway: { median: 24, top25: 36, bottom25: 16, unit: "months" },
    revenue_growth: { median: 8, top25: 15, bottom25: 3, unit: "MoM %" },
    gross_margin: { median: 75, top25: 88, bottom25: 60, unit: "%" },
    ltv_cac_ratio: { median: 3.5, top25: 6.0, bottom25: 2.5, unit: "x" },
    churn_rate: { median: 3, top25: 1, bottom25: 6, unit: "monthly %" },
    burn_multiple: { median: 1.5, top25: 0.8, bottom25: 3.0, unit: "x" },
    rule_of_40: { median: 35, top25: 60, bottom25: 10, unit: "%" },
    magic_number: { median: 0.8, top25: 1.2, bottom25: 0.4, unit: "x" },
  },
};

// ── Handlers ─────────────────────────────────────────────────────────────────

async function computeMetrics(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const data = input as z.infer<typeof computeMetricsSchema>;
  const ctx = requireCompanyId(context);
  let scenarioId = data.scenarioId || ctx.scenarioId;
  if (!scenarioId) {
    const defScenario = await getDefaultScenario(ctx.companyId);
    if (!defScenario) {
      return JSON.stringify({ success: false, error: "No scenario found" });
    }
    scenarioId = defScenario.id;
  }
  const dashboard = await computeDashboardData(ctx.companyId, scenarioId);

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

async function createAccount(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const data = input as z.infer<typeof createAccountSchema>;

  const ctx = requireCompanyId(context);

  const res = await mutateInsert(ctx, "financial_account", financialAccounts, {
    companyId: ctx.companyId,
    name: data.name,
    type: data.type,
    category: data.category,
    coversHeadcount: data.coversHeadcount ?? false,
  });
  if ("planned" in res) return planResultJson(res.planned);
  const row = res.row;

  return JSON.stringify({
    success: true,
    accountId: row!.id,
    message: `Created account "${data.name}" (${data.category}). ID: ${row!.id}`,
  });
}

async function categorizeTransactions(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const ctx = requireCompanyId(context);

  // Fetch existing accounts for category matching
  const accounts = await db
    .select()
    .from(financialAccounts)
    .where(eq(financialAccounts.companyId, ctx.companyId));

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
  const ctx = requireCompanyId(context);
  let scenarioId = ctx.scenarioId;
  if (!scenarioId) {
    const defScenario = await getDefaultScenario(ctx.companyId);
    if (!defScenario) {
      return JSON.stringify({ success: false, error: "No scenario found" });
    }
    scenarioId = defScenario.id;
  }
  const dashboard = await computeDashboardData(ctx.companyId, scenarioId);

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
  const ctx = requireCompanyId(context);
  let scenarioId = data.scenarioId || ctx.scenarioId;
  if (!scenarioId) {
    const defScenario = await getDefaultScenario(ctx.companyId);
    if (!defScenario) {
      return JSON.stringify({ success: false, error: "No scenario found" });
    }
    scenarioId = defScenario.id;
  }
  const dashboard = await computeDashboardData(ctx.companyId, scenarioId);

  const excludeCategories = data.excludeCategories;
  const targetSavingsPercent = data.targetSavingsPercent;

  // Get expense accounts with their forecast amounts
  const accounts = await db
    .select()
    .from(financialAccounts)
    .where(eq(financialAccounts.companyId, ctx.companyId));

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

async function benchmarkMetrics(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const data = input as z.infer<typeof benchmarkMetricsSchema>;
  const ctx = requireCompanyId(context);
  let scenarioId = ctx.scenarioId;
  if (!scenarioId) {
    const defScenario = await getDefaultScenario(ctx.companyId);
    if (!defScenario) {
      return JSON.stringify({ success: false, error: "No scenario found" });
    }
    scenarioId = defScenario.id;
  }
  const dashboard = await computeDashboardData(ctx.companyId, scenarioId);
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

async function updateAccount(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const data = input as z.infer<typeof updateAccountSchema>;

  const ctx = requireCompanyId(context);

  const [existing] = await db
    .select({ id: financialAccounts.id, name: financialAccounts.name, isSystem: financialAccounts.isSystem })
    .from(financialAccounts)
    .where(and(eq(financialAccounts.id, data.id), eq(financialAccounts.companyId, ctx.companyId)));
  if (!existing) {
    return JSON.stringify({ success: false, error: "Account not found or access denied" });
  }
  if (existing.isSystem) {
    return JSON.stringify({ success: false, error: "Cannot modify system accounts" });
  }

  const updates: Record<string, unknown> = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.type !== undefined) updates.type = data.type;
  if (data.category !== undefined) updates.category = data.category;

  if (Object.keys(updates).length === 0) {
    return JSON.stringify({ success: false, error: "No fields to update" });
  }

  const res = await mutateUpdate(ctx, "financial_account", financialAccounts, data.id, updates);
  if ("planned" in res) return planResultJson(res.planned);

  return JSON.stringify({
    success: true,
    message: `Updated account "${data.name ?? existing.name}".`,
  });
}

async function deleteAccount(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const data = input as z.infer<typeof deleteAccountSchema>;

  const ctx = requireCompanyId(context);

  const [existing] = await db
    .select({ id: financialAccounts.id, name: financialAccounts.name, isSystem: financialAccounts.isSystem })
    .from(financialAccounts)
    .where(and(eq(financialAccounts.id, data.id), eq(financialAccounts.companyId, ctx.companyId)));
  if (!existing) {
    return JSON.stringify({ success: false, error: "Account not found or access denied" });
  }
  if (existing.isSystem) {
    return JSON.stringify({ success: false, error: "Cannot delete system accounts" });
  }

  const res = await mutateDelete(ctx, "financial_account", financialAccounts, data.id);
  if ("planned" in res) return planResultJson(res.planned);

  return JSON.stringify({
    success: true,
    message: `Deleted account "${existing.name}" and all associated transactions and forecast lines.`,
  });
}

// ── Registry ─────────────────────────────────────────────────────────────────

export const analyticsSchemas: Record<string, z.ZodType> = {
  get_metrics: computeMetricsSchema,
  create_account: createAccountSchema,
  update_account: updateAccountSchema,
  delete_account: deleteAccountSchema,
  get_transaction_categories: categorizeTransactionsSchema,
  get_report_data: generateReportNarrativeSchema,
  get_expense_analysis: suggestCostCutsSchema,
  get_metric_benchmarks: benchmarkMetricsSchema,
};

export const analyticsHandlers: Record<string, ToolHandler> = {
  get_metrics: computeMetrics,
  create_account: createAccount,
  update_account: updateAccount,
  delete_account: deleteAccount,
  get_transaction_categories: categorizeTransactions,
  get_report_data: generateReportNarrative,
  get_expense_analysis: suggestCostCuts,
  get_metric_benchmarks: benchmarkMetrics,
};
