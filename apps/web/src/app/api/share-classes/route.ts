import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { listShareClasses, createShareClass } from "@burnless/db";
import { createShareClassSchema } from "@burnless/types";
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

export const GET = withErrorHandler(async (_request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const rows = await listShareClasses(ctx.companyId);
  return NextResponse.json(rows);
});

export const POST = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;

  // Cap-table structure is base-data-only — share classes are not scenario-editable
  // (resolveEntities is registered for forecast_line + funding_round only). Refuse
  // the write while a scenario is active so cookie/header state can't drift.
  const scenarioId = getActiveScenario(request);
  if (scenarioId) {
    return errorResponse("Cap-table structure is not scenario-editable yet", 409);
  }

  const parsed = await parseBody(request, createShareClassSchema);
  if ("error" in parsed) return parsed.error;
  const data = parsed.data;

  // numeric() columns are STRINGS at the DB boundary (numeric(18,0) share counts
  // are integers) — String()-coerce before insert (the bug class that 500'd a save).
  const row = await createShareClass(ctx.companyId, {
    name: data.name,
    classType: data.classType,
    totalAuthorized: String(data.totalAuthorized),
    totalIssued: String(data.totalIssued),
    liquidationPreference: String(data.liquidationPreference),
    ...(data.parValue != null ? { parValue: String(data.parValue) } : {}),
  });

  await logAudit(ctx, "share_class", row.id, "create", { after: row });
  await trackDataMutation(ctx.companyId, "funding");
  revalidateTag("cap-table");
  return NextResponse.json(row, { status: 201 });
});
