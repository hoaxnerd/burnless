import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db, scenarios, scenarioOverrides, deleteOverride } from "@burnless/db";
import { eq, and, isNull } from "drizzle-orm";
import { requireCompanyAccess, requireRole, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { applyRateLimit } from "@/lib/api-rate-limit";
import { logAudit } from "@/lib/audit";
import { trackDataMutation } from "@/lib/data-mutation-tracker";

/**
 * DELETE /api/scenarios/overrides/[id]
 *
 * Deletes a single override row (reverts that entity to base).
 * Requires editor+ role.
 */
export const DELETE = withErrorHandler(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const blocked = await applyRateLimit(request, "mutation");
  if (blocked) return blocked;

  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;

  const { id } = await params;

  // Look up the override to verify it belongs to a scenario owned by this company
  const [override] = await db
    .select({
      id: scenarioOverrides.id,
      scenarioId: scenarioOverrides.scenarioId,
      entityType: scenarioOverrides.entityType,
      entityId: scenarioOverrides.entityId,
    })
    .from(scenarioOverrides)
    .where(eq(scenarioOverrides.id, id))
    .limit(1);
  if (!override) return errorResponse("Override not found", 404);

  // Verify the parent scenario belongs to this company
  const [scenario] = await db
    .select({ id: scenarios.id })
    .from(scenarios)
    .where(
      and(
        eq(scenarios.id, override.scenarioId),
        eq(scenarios.companyId, ctx.companyId),
        isNull(scenarios.deletedAt),
      ),
    )
    .limit(1);
  if (!scenario) return errorResponse("Override not found", 404);

  await deleteOverride(id);

  await logAudit(ctx, "scenario", override.scenarioId, "update", {
    before: { overrideId: id, entityType: override.entityType, entityId: override.entityId },
  });
  await trackDataMutation(ctx.companyId, "scenarios");
  revalidateTag("scenarios");

  return NextResponse.json({ deleted: true });
});
