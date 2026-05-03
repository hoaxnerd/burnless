import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import {
  db,
  headcountPlans,
  listResolvedEquityGrants,
  createEquityGrant,
} from "@burnless/db";
import { and, eq } from "drizzle-orm";
import { createEquityGrantSchema } from "@burnless/types";
import {
  requireCompanyAccess,
  requireRole,
  parseBody,
  errorResponse,
  withErrorHandler,
} from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { trackDataMutation } from "@/lib/data-mutation-tracker";
import { getActiveScenario } from "@/lib/scenario-middleware";

export const GET = withErrorHandler(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const { id: headcountId } = await params;

  const [parent] = await db
    .select({ id: headcountPlans.id })
    .from(headcountPlans)
    .where(
      and(
        eq(headcountPlans.id, headcountId),
        eq(headcountPlans.companyId, ctx.companyId)
      )
    );
  if (!parent) return errorResponse("Headcount not found", 404);

  const scenarioId = getActiveScenario(request);
  const rows = await listResolvedEquityGrants(ctx.companyId, headcountId, scenarioId);
  return NextResponse.json(rows);
});

export const POST = withErrorHandler(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;
  const { id: headcountId } = await params;

  const [parent] = await db
    .select({ id: headcountPlans.id })
    .from(headcountPlans)
    .where(
      and(
        eq(headcountPlans.id, headcountId),
        eq(headcountPlans.companyId, ctx.companyId)
      )
    );
  if (!parent) return errorResponse("Headcount not found", 404);

  const scenarioId = getActiveScenario(request);
  const parsed = await parseBody(request, createEquityGrantSchema);
  if ("error" in parsed) return parsed.error;

  const row = await createEquityGrant(
    {
      companyId: ctx.companyId,
      headcountId,
      grantDate: parsed.data.grantDate,
      shares: parsed.data.shares.toFixed(4),
      strikePrice:
        parsed.data.strikePrice == null ? null : parsed.data.strikePrice.toFixed(4),
      grantType: parsed.data.grantType,
      parameters: parsed.data.parameters ?? {},
    },
    scenarioId
  );

  if (row) await logAudit(ctx, "equity_grant", row.id, "create", { after: row });
  await trackDataMutation(ctx.companyId, "headcount");
  revalidateTag("headcount-plans");
  revalidateTag("scenario-overrides");
  return NextResponse.json(row, { status: 201 });
});
