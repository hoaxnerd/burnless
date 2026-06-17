/**
 * Resolve a tool's effective scenario target for a single call (spec §4.4).
 *   - undefined        → the turn's active scenario (ctx.scenarioId)
 *   - "base"           → null (base data, no overlay)
 *   - a scenario UUID  → validated against the company, else an error result
 * Never silently falls to base on a forgotten param — omission uses the turn target.
 */
import { db, scenarios } from "@burnless/db";
import { and, eq, isNull } from "drizzle-orm";
import type { ToolContext } from "./types";

export type ResolvedScenario =
  | { ok: true; scenarioId: string | null }
  | { ok: false; error: string };

export async function resolveToolScenario(
  explicit: string | undefined,
  ctx: ToolContext,
): Promise<ResolvedScenario> {
  if (explicit === undefined) return { ok: true, scenarioId: ctx.scenarioId ?? null };
  if (explicit === "base") return { ok: true, scenarioId: null };
  if (!ctx.companyId) return { ok: false, error: "Company ID required to target a scenario." };
  const [row] = await db
    .select({ id: scenarios.id })
    .from(scenarios)
    .where(and(eq(scenarios.id, explicit), eq(scenarios.companyId, ctx.companyId), isNull(scenarios.deletedAt)));
  if (!row) return { ok: false, error: `Scenario "${explicit}" not found or access denied.` };
  return { ok: true, scenarioId: row.id };
}
