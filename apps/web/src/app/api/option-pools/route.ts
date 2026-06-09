import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { listOptionPools, createOptionPool, countOptionPools } from "@burnless/db";
import { createOptionPoolSchema } from "@burnless/types";
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

  const rows = await listOptionPools(ctx.companyId);
  return NextResponse.json(rows);
});

export const POST = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;

  // Cap-table structure is base-data-only — option pools are not scenario-editable
  // (resolveEntities is registered for forecast_line + funding_round only). Refuse
  // the write while a scenario is active so cookie/header state can't drift.
  const scenarioId = getActiveScenario(request);
  if (scenarioId) {
    return errorResponse("Cap-table structure is not scenario-editable yet", 409);
  }

  // Single-pool guard (Phase 3 F §F5): equityGrants has no optionPoolId column, so
  // buildOptionPoolsWithGranted (compute-cap-table.ts:47) throws on a 2nd pool.
  // Reject the 2nd pool LOUDLY at the write layer before it can reach render.
  if ((await countOptionPools(ctx.companyId)) >= 1) {
    return NextResponse.json(
      { error: "Cap-table currently supports a single option pool.", code: "SINGLE_POOL_ONLY" },
      { status: 409 },
    );
  }

  const parsed = await parseBody(request, createOptionPoolSchema);
  if ("error" in parsed) return parsed.error;
  const data = parsed.data;

  // numeric() columns are STRINGS at the DB boundary (totalReserved is numeric(18,0)
  // integers) — String()-coerce before insert (the bug class that 500'd a save).
  const row = await createOptionPool(ctx.companyId, {
    name: data.name,
    totalReserved: String(data.totalReserved),
    refreshDate: data.refreshDate ?? null,
  });

  await logAudit(ctx, "option_pool", row.id, "create", { after: row });
  await trackDataMutation(ctx.companyId, "funding");
  revalidateTag("cap-table");
  return NextResponse.json(row, { status: 201 });
});
