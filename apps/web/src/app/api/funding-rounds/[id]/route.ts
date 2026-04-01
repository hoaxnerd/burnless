import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { fundingRounds, scenarioUpdate, scenarioDelete } from "@burnless/db";
import { updateFundingRoundSchema } from "@burnless/types";
import { requireCompanyAccess, requireRole, parseBody, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { trackDataMutation } from "@/lib/data-mutation-tracker";
import { getActiveScenario } from "@/lib/scenario-middleware";

export const PATCH = withErrorHandler(async (
  request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;
  const { id } = await context.params;

  const scenarioId = getActiveScenario(request);

  const parsed = await parseBody(request, updateFundingRoundSchema);
  if ("error" in parsed) return parsed.error;

  const changes: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.amount !== undefined) changes.amount = String(parsed.data.amount);
  if (parsed.data.preMoneyValuation !== undefined)
    changes.preMoneyValuation = parsed.data.preMoneyValuation != null ? String(parsed.data.preMoneyValuation) : null;
  if (parsed.data.dilutionPercent !== undefined)
    changes.dilutionPercent = parsed.data.dilutionPercent != null ? String(parsed.data.dilutionPercent) : null;

  const row = await scenarioUpdate("funding_round", fundingRounds, id, changes, scenarioId);
  if (!row) return errorResponse("Funding round not found", 404);
  await logAudit(ctx, "funding_round", id, "update", { after: row });
  await trackDataMutation(ctx.companyId, "funding");
  revalidateTag("funding-rounds");
  return NextResponse.json(row);
});

export const DELETE = withErrorHandler(async (
  request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "admin");
  if (roleErr) return roleErr;
  const { id } = await context.params;

  const scenarioId = getActiveScenario(request);

  await scenarioDelete("funding_round", fundingRounds, id, scenarioId);
  await logAudit(ctx, "funding_round", id, "delete", {});
  await trackDataMutation(ctx.companyId, "funding");
  revalidateTag("funding-rounds");
  return NextResponse.json({ deleted: true });
});
