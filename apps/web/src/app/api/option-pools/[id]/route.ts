import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { updateOptionPool, softDeleteOptionPool } from "@burnless/db";
import { updateOptionPoolSchema } from "@burnless/types";
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

  // Cap-table structure is base-data-only — option pools are not scenario-editable
  // (resolveEntities is registered for forecast_line + funding_round only). Refuse
  // the write while a scenario is active so cookie/header state can't drift (Phase 2 D).
  const scenarioId = getActiveScenario(request);
  if (scenarioId) {
    return errorResponse("Cap-table structure is not scenario-editable yet", 409);
  }

  const parsed = await parseBody(request, updateOptionPoolSchema);
  if ("error" in parsed) return parsed.error;
  const data = parsed.data;

  // numeric() columns are STRINGS at the DB boundary (totalReserved is numeric(18,0)
  // integers) — String()-coerce only the present numeric keys before update (the bug
  // class that 500'd a funding save). Mirror share-classes [id] route.ts.
  const changes: Record<string, unknown> = {};
  if (data.name !== undefined) changes.name = data.name;
  if (data.totalReserved !== undefined) changes.totalReserved = String(data.totalReserved);
  if (data.refreshDate !== undefined)
    changes.refreshDate = data.refreshDate ? new Date(data.refreshDate) : null;

  const row = await updateOptionPool(id, ctx.companyId, changes);
  if (!row) return errorResponse("Option pool not found", 404);

  await logAudit(ctx, "option_pool", id, "update", { after: row });
  await trackDataMutation(ctx.companyId, "funding");
  revalidateTag("cap-table");
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

  // DELETE is SOFT (deletedAt) so listOptionPools keeps filtering isNull(deletedAt).
  const ok = await softDeleteOptionPool(id, ctx.companyId);
  if (!ok) return errorResponse("Option pool not found", 404);

  await logAudit(ctx, "option_pool", id, "delete", {});
  await trackDataMutation(ctx.companyId, "funding");
  revalidateTag("cap-table");
  return NextResponse.json({ deleted: true });
});
