/**
 * Scenario creation and comparison tools.
 */

import { db } from "@burnless/db";
import { scenarios } from "@burnless/db";
import { z } from "zod";
import { computeDashboardData } from "../compute-dashboard";
import type { ToolContext, ToolHandler } from "./types";
import { nameString, descriptionString, idString, sumValues } from "./types";

// ── Schemas ──────────────────────────────────────────────────────────────────

export const createScenarioSchema = z.object({
  name: nameString,
  type: z.enum(["base", "best", "worst", "custom"]),
  description: descriptionString,
});

export const compareScenarioSchema = z.object({
  baseScenarioId: idString,
  compareScenarioId: idString,
});

// ── Handlers ─────────────────────────────────────────────────────────────────

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

// ── Registry ─────────────────────────────────────────────────────────────────

export const scenarioSchemas: Record<string, z.ZodType> = {
  create_scenario: createScenarioSchema,
  compare_scenarios: compareScenarioSchema,
};

export const scenarioHandlers: Record<string, ToolHandler> = {
  create_scenario: createScenario,
  compare_scenarios: compareScenariosTool,
};
