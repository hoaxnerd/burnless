import { NextResponse } from "next/server";
import { db, scenarios, getOverridesForScenario, getOverrideCount } from "@burnless/db";
import { eq, and, isNull } from "drizzle-orm";
import { requireCompanyAccess, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { applyRateLimit } from "@/lib/api-rate-limit";

/**
 * GET /api/scenarios/overrides?scenarioId=xxx
 *
 * Returns all overrides for a scenario, grouped by entity type.
 * Supports `?count=true` to return only the count (used by the banner).
 */
export const GET = withErrorHandler(async (request: Request) => {
  const blocked = await applyRateLimit(request, "read");
  if (blocked) return blocked;

  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const url = new URL(request.url);
  const scenarioId = url.searchParams.get("scenarioId");
  if (!scenarioId) return errorResponse("scenarioId query param is required", 400);

  // Verify scenario belongs to this company
  const [scenario] = await db
    .select({ id: scenarios.id })
    .from(scenarios)
    .where(
      and(
        eq(scenarios.id, scenarioId),
        eq(scenarios.companyId, ctx.companyId),
        isNull(scenarios.deletedAt),
      ),
    )
    .limit(1);
  if (!scenario) return errorResponse("Scenario not found", 404);

  // Count-only mode for the banner
  const countOnly = url.searchParams.get("count") === "true";
  if (countOnly) {
    const count = await getOverrideCount(scenarioId);
    return NextResponse.json({ count });
  }

  // Full override list grouped by entity type
  const overrides = await getOverridesForScenario(scenarioId);

  // Group by entity type
  const groupMap = new Map<string, typeof overrides>();
  for (const override of overrides) {
    const group = groupMap.get(override.entityType) ?? [];
    group.push(override);
    groupMap.set(override.entityType, group);
  }

  // Build summary counts
  let modified = 0;
  let created = 0;
  let deleted = 0;
  for (const override of overrides) {
    if (override.action === "modify") modified++;
    else if (override.action === "create") created++;
    else if (override.action === "delete") deleted++;
  }

  const groups = Array.from(groupMap.entries()).map(([entityType, items]) => ({
    entityType,
    overrides: items,
  }));

  return NextResponse.json({
    summary: { modified, created, deleted, total: overrides.length },
    groups,
  });
});
