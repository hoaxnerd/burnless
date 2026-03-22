/**
 * Scenario creation, update, deletion, and comparison tools.
 */

import { db } from "@burnless/db";
import { scenarios } from "@burnless/db";
import { eq, and } from "drizzle-orm";
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

export const updateScenarioSchema = z.object({
  id: idString,
  name: nameString.optional(),
  type: z.enum(["base", "best", "worst", "custom"]).optional(),
  description: descriptionString,
});

export const deleteScenarioSchema = z.object({
  id: idString,
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

async function updateScenario(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const data = input as z.infer<typeof updateScenarioSchema>;

  // Verify ownership
  const [existing] = await db
    .select({ id: scenarios.id })
    .from(scenarios)
    .where(and(eq(scenarios.id, data.id), eq(scenarios.companyId, context.companyId)));
  if (!existing) {
    return JSON.stringify({ success: false, error: "Scenario not found or access denied" });
  }

  const updates: Record<string, unknown> = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.type !== undefined) updates.type = data.type;
  if (data.description !== undefined) updates.description = data.description;

  if (Object.keys(updates).length === 0) {
    return JSON.stringify({ success: false, error: "No fields to update" });
  }

  const [row] = await db
    .update(scenarios)
    .set(updates)
    .where(eq(scenarios.id, data.id))
    .returning();

  return JSON.stringify({
    success: true,
    scenarioId: row!.id,
    message: `Updated scenario "${row!.name}".`,
  });
}

async function deleteScenario(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const data = input as z.infer<typeof deleteScenarioSchema>;

  // Verify ownership and prevent deleting default
  const [existing] = await db
    .select({ id: scenarios.id, name: scenarios.name, isDefault: scenarios.isDefault })
    .from(scenarios)
    .where(and(eq(scenarios.id, data.id), eq(scenarios.companyId, context.companyId)));
  if (!existing) {
    return JSON.stringify({ success: false, error: "Scenario not found or access denied" });
  }
  if (existing.isDefault) {
    return JSON.stringify({ success: false, error: "Cannot delete the default scenario" });
  }

  await db.delete(scenarios).where(eq(scenarios.id, data.id));

  return JSON.stringify({
    success: true,
    message: `Deleted scenario "${existing.name}". All associated forecast lines, headcount plans, and revenue streams were also removed.`,
  });
}

// ── Registry ─────────────────────────────────────────────────────────────────

export const scenarioSchemas: Record<string, z.ZodType> = {
  create_scenario: createScenarioSchema,
  update_scenario: updateScenarioSchema,
  delete_scenario: deleteScenarioSchema,
  compare_scenarios: compareScenarioSchema,
};

export const scenarioHandlers: Record<string, ToolHandler> = {
  create_scenario: createScenario,
  update_scenario: updateScenario,
  delete_scenario: deleteScenario,
  compare_scenarios: compareScenariosTool,
};
