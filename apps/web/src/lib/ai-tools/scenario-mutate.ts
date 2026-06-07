/**
 * Mode-aware scenario-mutation facade (spec §4.2). Every AI tool handler routes
 * its scenario writes through here so plan mode is guaranteed write-free: in
 * "plan" mode the call returns the computed ScenarioPlan[] (the diff-gate
 * payload) without touching the DB; in "commit" mode (default) it performs the
 * real write exactly as before.
 */
import {
  scenarioInsert,
  scenarioUpdate,
  scenarioDelete,
  planScenarioInsert,
  planScenarioUpdate,
  planScenarioDelete,
  type ScenarioPlan,
} from "@burnless/db";
import { requireCompanyId, type ToolContext } from "./types";

export type PlanResult = { planned: ScenarioPlan[] };
export type InsertResult = PlanResult | { row: any };
export type UpdateResult = PlanResult | { row: any };
export type DeleteResult = PlanResult | { deleted: boolean };

function requireScenario(ctx: ToolContext): string {
  if (!ctx.scenarioId) throw new Error("Plan mode requires an active scenario");
  return ctx.scenarioId;
}

export async function mutateInsert(
  ctx: ToolContext,
  entityType: string,
  table: any,
  data: Record<string, any>,
): Promise<InsertResult> {
  const companyId = requireCompanyId(ctx).companyId;
  if (ctx.mode === "plan") {
    return { planned: [await planScenarioInsert(entityType, table, data, requireScenario(ctx), companyId)] };
  }
  return { row: await scenarioInsert(entityType, table, data, ctx.scenarioId ?? null, companyId) };
}

export async function mutateUpdate(
  ctx: ToolContext,
  entityType: string,
  table: any,
  entityId: string,
  changes: Record<string, any>,
): Promise<UpdateResult> {
  const companyId = requireCompanyId(ctx).companyId;
  if (ctx.mode === "plan") {
    return { planned: [await planScenarioUpdate(entityType, table, entityId, changes, requireScenario(ctx), companyId)] };
  }
  return { row: await scenarioUpdate(entityType, table, entityId, changes, ctx.scenarioId ?? null, companyId) };
}

export async function mutateDelete(
  ctx: ToolContext,
  entityType: string,
  table: any,
  entityId: string,
): Promise<DeleteResult> {
  const companyId = requireCompanyId(ctx).companyId;
  if (ctx.mode === "plan") {
    return { planned: await planScenarioDelete(entityType, table, entityId, requireScenario(ctx), companyId) };
  }
  return { deleted: await scenarioDelete(entityType, table, entityId, ctx.scenarioId ?? null, companyId) };
}

/** Stable plan-mode result envelope a handler returns; consumed by the diff-gate (Plan 3). */
export function planResultJson(overrides: ScenarioPlan[]): string {
  return JSON.stringify({ planned: true, overrides });
}
