import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db, scenarios, scenarioOverrides, getOverridesForScenario } from "@burnless/db";
import { eq, and, isNull, sql } from "drizzle-orm";
import { requireCompanyAccess, requireRole, requirePlanFeature, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { applyRateLimit } from "@/lib/api-rate-limit";
import { logAudit } from "@/lib/audit";
import { trackDataMutation } from "@/lib/data-mutation-tracker";

/**
 * POST /api/scenarios/[id]/duplicate
 *
 * Creates a new scenario cloned from the source, copying all overrides.
 * Requires editor+ role.
 */
export const POST = withErrorHandler(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const blocked = await applyRateLimit(request, "mutation");
  if (blocked) return blocked;

  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;

  const { id: sourceId } = await params;

  // Verify source scenario belongs to this company
  const [source] = await db
    .select()
    .from(scenarios)
    .where(
      and(
        eq(scenarios.id, sourceId),
        eq(scenarios.companyId, ctx.companyId),
        isNull(scenarios.deletedAt),
      ),
    )
    .limit(1);
  if (!source) return errorResponse("Scenario not found", 404);

  // Feature gate: check scenario limit
  const countResult = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(scenarios)
    .where(and(eq(scenarios.companyId, ctx.companyId), isNull(scenarios.deletedAt)));
  const scenarioCount = countResult[0]?.count ?? 0;
  const gateErr = await requirePlanFeature(ctx.companyId, "create_scenario", scenarioCount);
  if (gateErr) return gateErr;

  // Create new scenario
  const [newScenario] = await db
    .insert(scenarios)
    .values({
      companyId: ctx.companyId,
      name: `${source.name} (copy)`,
      description: source.description,
      source: "clone",
      sourceScenarioId: sourceId,
      color: source.color,
    })
    .returning();

  if (!newScenario) return errorResponse("Failed to create scenario", 500);

  // Copy all overrides from source to new scenario
  const sourceOverrides = await getOverridesForScenario(sourceId);
  if (sourceOverrides.length > 0) {
    await db.insert(scenarioOverrides).values(
      sourceOverrides.map((o) => ({
        scenarioId: newScenario.id,
        entityType: o.entityType,
        entityId: o.entityId,
        action: o.action,
        data: o.data,
        originalData: o.originalData,
      })),
    );
  }

  await logAudit(ctx, "scenario", newScenario.id, "create", {
    after: { ...newScenario, clonedFrom: sourceId },
  });
  await trackDataMutation(ctx.companyId, "scenarios");
  revalidateTag("scenarios");

  return NextResponse.json(newScenario, { status: 201 });
});
