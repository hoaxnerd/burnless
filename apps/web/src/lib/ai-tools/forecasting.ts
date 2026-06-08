/**
 * Forecast line creation, revenue forecasting, and financial statement generation.
 */

import { db } from "@burnless/db";
import { forecastLines } from "@burnless/db";
import { mutateInsert, mutateUpdate, mutateDelete, planResultJson } from "./scenario-mutate";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { CreateExpenseSchema, UpdateExpenseSchema } from "@burnless/ai";
import { computeDashboardData } from "../compute-dashboard";
import { seriesToArray, ratioToPct } from "@burnless/engine";
import { formatPercent } from "@burnless/types";
import { getDefaultScenario } from "../data";
import type { ToolContext, ToolHandler } from "./types";
import {
  optionalId,
  monthCount,
  sumValues,
  requireCompanyId,
} from "./types";

// ── Update/Delete Schemas ────────────────────────────────────────────────────

/**
 * Re-exported from `@burnless/ai` so the canonical Phase-1 expense contract
 * lives in a single place (mirrors the JSON Schema in `@burnless/ai/tools.ts`).
 */
export const updateForecastLineSchema = UpdateExpenseSchema;

export const deleteForecastLineSchema = z.object({
  id: z.string().min(1),
});

// ── Schemas ──────────────────────────────────────────────────────────────────

export const createForecastLineSchema = CreateExpenseSchema;

export const generateStatementsSchema = z.object({
  scenarioId: optionalId,
});

export const forecastRevenueSchema = z.object({
  scenarioId: optionalId,
  months: monthCount,
  method: z.enum(["auto", "linear", "exponential", "conservative"]).default("auto"),
  includeConfidenceIntervals: z.boolean().default(true),
});

// ── Handlers ─────────────────────────────────────────────────────────────────

async function createForecastLine(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const parsed = createForecastLineSchema.safeParse(input);
  if (!parsed.success) {
    return JSON.stringify({
      success: false,
      error: `Invalid input: ${parsed.error.message}`,
    });
  }
  const data = parsed.data;
  const ctx = requireCompanyId(context);

  const res = await mutateInsert(ctx, "forecast_line", forecastLines, {
    companyId: ctx.companyId,
    accountId: data.accountId,
    method: data.method,
    parameters: data.parameters,
    startDate: new Date(data.startDate),
    endDate: data.endDate ? new Date(data.endDate) : null,
    notes: data.notes ?? null,
    vendor: data.vendor ?? null,
    departmentId: data.departmentId ?? null,
    frequency: data.frequency,
    isOneTime: data.isOneTime,
    isRecurring: data.isRecurring ?? null,
  });
  if ("planned" in res) return planResultJson(res.planned);
  const row = res.row;

  return JSON.stringify({
    success: true,
    forecastLineId: row!.id,
    message: `Created forecast line for account ${data.accountId} using ${data.method} method.`,
  });
}

async function generateStatements(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const data = input as z.infer<typeof generateStatementsSchema>;
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

async function forecastRevenue(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const data = input as z.infer<typeof forecastRevenueSchema>;
  const ctx = requireCompanyId(context);
  let scenarioId = data.scenarioId || ctx.scenarioId;
  if (!scenarioId) {
    const defScenario = await getDefaultScenario(ctx.companyId);
    if (!defScenario) {
      return JSON.stringify({ success: false, error: "No scenario found" });
    }
    scenarioId = defScenario.id;
  }
  const months = Math.min(data.months, 36);
  const method = data.method;
  const includeCI = data.includeConfidenceIntervals;

  const dashboard = await computeDashboardData(ctx.companyId, scenarioId);
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
    message: `Projected ${months} months of revenue using ${effectiveMethod} method. Average historical growth: ${formatPercent(ratioToPct(avgGrowth), undefined, 1)}/month.`,
  });
}

async function updateForecastLine(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const parsed = updateForecastLineSchema.safeParse(input);
  if (!parsed.success) {
    return JSON.stringify({
      success: false,
      error: `Invalid input: ${parsed.error.message}`,
    });
  }
  const data = parsed.data;
  const ctx = requireCompanyId(context);

  // Verify ownership
  const [existing] = await db
    .select({ id: forecastLines.id, accountId: forecastLines.accountId, companyId: forecastLines.companyId })
    .from(forecastLines)
    .where(and(eq(forecastLines.id, data.id), eq(forecastLines.companyId, ctx.companyId)));
  if (!existing) {
    return JSON.stringify({ success: false, error: "Forecast line not found or access denied" });
  }

  const updates: Record<string, unknown> = {};
  if (data.method !== undefined) updates.method = data.method;
  if (data.parameters !== undefined) updates.parameters = data.parameters;
  if (data.startDate !== undefined) updates.startDate = new Date(data.startDate);
  if (data.endDate !== undefined) updates.endDate = data.endDate ? new Date(data.endDate) : null;
  // Phase-1 metadata. `null` clears the field; `undefined` leaves it untouched.
  if (data.notes !== undefined) updates.notes = data.notes;
  if (data.vendor !== undefined) updates.vendor = data.vendor;
  if (data.departmentId !== undefined) updates.departmentId = data.departmentId;
  if (data.frequency !== undefined) updates.frequency = data.frequency;
  if (data.isOneTime !== undefined) updates.isOneTime = data.isOneTime;
  if (data.isRecurring !== undefined) updates.isRecurring = data.isRecurring;

  if (Object.keys(updates).length === 0) {
    return JSON.stringify({ success: false, error: "No fields to update" });
  }

  const res = await mutateUpdate(ctx, "forecast_line", forecastLines, data.id, updates);
  if ("planned" in res) return planResultJson(res.planned);

  return JSON.stringify({
    success: true,
    message: `Updated forecast line for account ${existing.accountId}.`,
  });
}

async function deleteForecastLine(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const parsed = deleteForecastLineSchema.safeParse(input);
  if (!parsed.success) {
    return JSON.stringify({
      success: false,
      error: `Invalid input: ${parsed.error.message}`,
    });
  }
  const data = parsed.data;
  const ctx = requireCompanyId(context);

  // Verify ownership
  const [existing] = await db
    .select({ id: forecastLines.id, accountId: forecastLines.accountId, companyId: forecastLines.companyId })
    .from(forecastLines)
    .where(and(eq(forecastLines.id, data.id), eq(forecastLines.companyId, ctx.companyId)));
  if (!existing) {
    return JSON.stringify({ success: false, error: "Forecast line not found or access denied" });
  }

  const res = await mutateDelete(ctx, "forecast_line", forecastLines, data.id);
  if ("planned" in res) return planResultJson(res.planned);

  return JSON.stringify({
    success: true,
    message: `Deleted forecast line for account ${existing.accountId} and all associated forecast values.`,
  });
}

// ── Registry ─────────────────────────────────────────────────────────────────

export const forecastingSchemas: Record<string, z.ZodType> = {
  create_forecast_line: createForecastLineSchema,
  update_forecast_line: updateForecastLineSchema,
  delete_forecast_line: deleteForecastLineSchema,
  get_financial_statements: generateStatementsSchema,
  get_revenue_projection: forecastRevenueSchema,
};

export const forecastingHandlers: Record<string, ToolHandler> = {
  create_forecast_line: createForecastLine,
  update_forecast_line: updateForecastLine,
  delete_forecast_line: deleteForecastLine,
  get_financial_statements: generateStatements,
  get_revenue_projection: forecastRevenue,
};
