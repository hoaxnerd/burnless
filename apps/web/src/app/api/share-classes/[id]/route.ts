import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { updateShareClass, softDeleteShareClass } from "@burnless/db";
import { updateShareClassSchema } from "@burnless/types";
import {
  requireCompanyAccess,
  requireRole,
  parseBody,
  withErrorHandler,
  errorResponse,
} from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { trackDataMutation } from "@/lib/data-mutation-tracker";
import { getActiveScenario } from "@/lib/scenario-middleware";

export const PATCH = withErrorHandler(async (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;
  const { id } = await context.params;

  // Cap-table structure is base-data-only — share classes are not scenario-editable
  // (resolveEntities is registered for forecast_line + funding_round only). Refuse
  // the write while a scenario is active so cookie/header state can't drift (Phase 2 D).
  const scenarioId = getActiveScenario(request);
  if (scenarioId) {
    return errorResponse("Cap-table structure is not scenario-editable yet", 409);
  }

  const parsed = await parseBody(request, updateShareClassSchema);
  if ("error" in parsed) return parsed.error;
  const data = parsed.data;

  // numeric() columns are STRINGS at the DB boundary (numeric(18,0) share counts
  // are integers) — String()-coerce only the present numeric keys before update
  // (the bug class that 500'd a funding save). Mirror funding [id] route.ts:43-52.
  const changes: Record<string, unknown> = {};
  if (data.name !== undefined) changes.name = data.name;
  if (data.classType !== undefined) changes.classType = data.classType;
  if (data.totalAuthorized !== undefined) changes.totalAuthorized = String(data.totalAuthorized);
  if (data.totalIssued !== undefined) changes.totalIssued = String(data.totalIssued);
  if (data.liquidationPreference !== undefined)
    changes.liquidationPreference = String(data.liquidationPreference);
  if (data.parValue !== undefined) changes.parValue = String(data.parValue);

  const row = await updateShareClass(id, ctx.companyId, changes);
  if (!row) return errorResponse("Share class not found", 404);

  await logAudit(ctx, "share_class", id, "update", { after: row });
  await trackDataMutation(ctx.companyId, "funding");
  revalidateTag("cap-table", { expire: 0 });
  return NextResponse.json(row);
});

export const DELETE = withErrorHandler(async (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "admin");
  if (roleErr) return roleErr;
  const { id } = await context.params;

  const scenarioId = getActiveScenario(request);
  if (scenarioId) {
    return errorResponse("Cap-table structure is not scenario-editable yet", 409);
  }

  // DELETE is SOFT (deletedAt) so listShareClasses keeps filtering isNull(deletedAt).
  const ok = await softDeleteShareClass(id, ctx.companyId);
  if (!ok) return errorResponse("Share class not found", 404);

  await logAudit(ctx, "share_class", id, "delete", {});
  await trackDataMutation(ctx.companyId, "funding");
  revalidateTag("cap-table", { expire: 0 });
  return NextResponse.json({ deleted: true });
});
