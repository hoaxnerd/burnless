/**
 * Scenario creation, update, deletion, and comparison tools.
 */

import { db, getOverrideBreakdown } from "@burnless/db";
import { scenarios } from "@burnless/db";
import { eq, and, isNull } from "drizzle-orm";
import { z } from "zod";
import { computeDashboardData } from "../compute-dashboard";
import type { ToolContext, ToolHandler } from "./types";
import { nameString, descriptionString, idString, sumValues, requireCompanyId } from "./types";

// ── Schemas ──────────────────────────────────────────────────────────────────

export const createScenarioSchema = z.object({
  name: nameString,
  description: descriptionString,
});

export const updateScenarioSchema = z.object({
  id: idString,
  name: nameString.optional(),
  description: descriptionString,
});

export const deleteScenarioSchema = z.object({
  id: idString,
});

export const compareScenarioSchema = z.object({
  baseScenarioId: idString,
  compareScenarioId: idString,
});

export const activateScenarioSchema = z.object({
  scenarioId: idString,
});

export const listScenariosSchema = z.object({});

// ── Handlers ─────────────────────────────────────────────────────────────────

async function createScenario(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const data = input as z.infer<typeof createScenarioSchema>;
  const ctx = requireCompanyId(context);
  const [row] = await db
    .insert(scenarios)
    .values({
      companyId: ctx.companyId,
      name: data.name,
      description: data.description ?? null,
      source: "ai",
      aiConversationId: ctx.conversationId ?? null,
    })
    .returning();

  return JSON.stringify({
    success: true,
    scenarioId: row!.id,
    name: row!.name,
    message: `Created scenario "${row!.name}". ID: ${row!.id}`,
  });
}

async function compareScenariosTool(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const data = input as z.infer<typeof compareScenarioSchema>;
  const baseId = data.baseScenarioId;
  const compareId = data.compareScenarioId;
  const ctx = requireCompanyId(context);

  const [baseDash, compareDash] = await Promise.all([
    computeDashboardData(ctx.companyId, baseId),
    computeDashboardData(ctx.companyId, compareId),
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
  const ctx = requireCompanyId(context);

  // Verify ownership
  const [existing] = await db
    .select({ id: scenarios.id })
    .from(scenarios)
    .where(and(eq(scenarios.id, data.id), eq(scenarios.companyId, ctx.companyId), isNull(scenarios.deletedAt)));
  if (!existing) {
    return JSON.stringify({ success: false, error: "Scenario not found or access denied" });
  }

  const updates: Record<string, unknown> = {};
  if (data.name !== undefined) updates.name = data.name;
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
  const ctx = requireCompanyId(context);

  // Verify ownership
  const [existing] = await db
    .select({ id: scenarios.id, name: scenarios.name })
    .from(scenarios)
    .where(and(eq(scenarios.id, data.id), eq(scenarios.companyId, ctx.companyId), isNull(scenarios.deletedAt)));
  if (!existing) {
    return JSON.stringify({ success: false, error: "Scenario not found or access denied" });
  }

  await db.update(scenarios).set({ deletedAt: new Date() }).where(eq(scenarios.id, data.id));

  return JSON.stringify({
    success: true,
    message: `Deleted scenario "${existing.name}". It can be restored if needed.`,
  });
}

async function activateScenario(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const data = input as z.infer<typeof activateScenarioSchema>;
  const ctx = requireCompanyId(context);
  // View-only control: verify the scenario is owned + not deleted, then hand the
  // id+name back. chat-stream emits `scenario_activated` from this result so the
  // client runs the real enterScenario (top bar) — no data is written here.
  const [row] = await db
    .select({ id: scenarios.id, name: scenarios.name })
    .from(scenarios)
    .where(and(eq(scenarios.id, data.scenarioId), eq(scenarios.companyId, ctx.companyId), isNull(scenarios.deletedAt)));
  if (!row) {
    return JSON.stringify({ success: false, error: "Scenario not found or access denied" });
  }
  return JSON.stringify({
    success: true,
    scenarioId: row.id,
    name: row.name,
    activated: true,
    message: `Activated scenario "${row.name}".`,
  });
}

async function listScenarios(
  _input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const ctx = requireCompanyId(context);
  const rows = await db
    .select({ id: scenarios.id, name: scenarios.name, source: scenarios.source, status: scenarios.status })
    .from(scenarios)
    .where(and(eq(scenarios.companyId, ctx.companyId), isNull(scenarios.deletedAt)))
    .orderBy(scenarios.createdAt);

  const breakdown = await getOverrideBreakdown(rows.map((r) => r.id));
  const byScenario = new Map<string, { entityType: string; action: string; count: number }[]>();
  for (const b of breakdown) {
    const list = byScenario.get(b.scenarioId) ?? [];
    list.push({ entityType: b.entityType, action: b.action, count: b.count });
    byScenario.set(b.scenarioId, list);
  }

  const out = rows.map((r) => {
    const changes = byScenario.get(r.id) ?? [];
    const overrideCount = changes.reduce((s, c) => s + c.count, 0);
    const headline =
      changes.length === 0
        ? "no changes from base"
        : changes.map((c) => `${c.count} ${c.entityType} ${c.action}`).join(", ");
    return { id: r.id, name: r.name, source: r.source, status: r.status, overrideCount, changes, headline };
  });

  return JSON.stringify({ success: true, scenarios: out });
}

// ── Registry ─────────────────────────────────────────────────────────────────

export const scenarioSchemas: Record<string, z.ZodType> = {
  create_scenario: createScenarioSchema,
  update_scenario: updateScenarioSchema,
  delete_scenario: deleteScenarioSchema,
  get_scenario_comparison: compareScenarioSchema,
  activate_scenario: activateScenarioSchema,
  list_scenarios: listScenariosSchema,
};

export const scenarioHandlers: Record<string, ToolHandler> = {
  create_scenario: createScenario,
  update_scenario: updateScenario,
  delete_scenario: deleteScenario,
  get_scenario_comparison: compareScenariosTool,
  activate_scenario: activateScenario,
  list_scenarios: listScenarios,
};
