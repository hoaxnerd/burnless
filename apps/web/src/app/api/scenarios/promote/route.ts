import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { db, scenarios, promoteScenario } from "@burnless/db";
import { eq, and, isNull } from "drizzle-orm";
import { requireCompanyAccess, requireRole, parseBody, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { applyRateLimit } from "@/lib/api-rate-limit";
import { logAudit } from "@/lib/audit";
import { trackDataMutation } from "@/lib/data-mutation-tracker";

const promoteBodySchema = z.object({
  scenarioId: z.string().min(1),
});

/**
 * POST /api/scenarios/promote
 *
 * Promotes a scenario: applies all overrides to the base data and creates a backup.
 * Requires admin+ role (this is a significant action).
 */
export const POST = withErrorHandler(async (request: Request) => {
  const blocked = await applyRateLimit(request, "heavy");
  if (blocked) return blocked;

  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "admin");
  if (roleErr) return roleErr;

  const parsed = await parseBody(request, promoteBodySchema);
  if ("error" in parsed) return parsed.error;

  const { scenarioId } = parsed.data;

  // Verify scenario belongs to this company and is active
  const [scenario] = await db
    .select({ id: scenarios.id, status: scenarios.status })
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
  if (scenario.status !== "active") {
    return errorResponse("Only active scenarios can be promoted", 400);
  }

  const result = await promoteScenario(scenarioId, ctx.companyId);

  await logAudit(ctx, "scenario", scenarioId, "update", {
    after: { action: "promote", backupId: result.backup.id },
  });
  await trackDataMutation(ctx.companyId, "scenarios");
  revalidateTag("scenarios");

  return NextResponse.json({
    backup: {
      id: result.backup.id,
      name: result.backup.name,
      autoDeleteAt: result.backup.autoDeleteAt,
    },
    promotedScenarioId: result.promotedScenarioId,
  });
});
