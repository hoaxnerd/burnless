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
  // Phase 2 D §1.2 / D2: roundType is immutable post-creation. Check first so the
  // error is specific and doesn't depend on auth/session state.
  let _peekBody: Record<string, unknown> = {};
  try {
    _peekBody = await request.clone().json();
  } catch {
    _peekBody = {};
  }
  if ("roundType" in _peekBody || "type" in _peekBody) {
    return NextResponse.json(
      {
        error: "Round type is immutable post-creation. Use create_funding_round to model a different type.",
        code: "ROUND_TYPE_IMMUTABLE",
      },
      { status: 400 },
    );
  }

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
  if (parsed.data.closeDate !== undefined)
    changes.closeDate = parsed.data.closeDate ? new Date(parsed.data.closeDate) : null;
  if (parsed.data.notes !== undefined) changes.notes = parsed.data.notes;
  if (parsed.data.parameters !== undefined) changes.parameters = parsed.data.parameters;

  const row = await scenarioUpdate("funding_round", fundingRounds, id, changes, scenarioId);
  if (!row) return errorResponse("Funding round not found", 404);
  await logAudit(ctx, "funding_round", id, "update", { after: row });
  await trackDataMutation(ctx.companyId, "funding");
  revalidateTag("funding-rounds");
  revalidateTag("scenario-overrides");
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
  revalidateTag("scenario-overrides");
  return NextResponse.json({ deleted: true });
});
