import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import {
  db,
  headcountPlans,
  updateEquityGrant,
  removeEquityGrant,
} from "@burnless/db";
import { and, eq } from "drizzle-orm";
import { updateEquityGrantSchema } from "@burnless/types";
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

async function verifyParent(headcountId: string, companyId: string) {
  const [parent] = await db
    .select({ id: headcountPlans.id })
    .from(headcountPlans)
    .where(
      and(
        eq(headcountPlans.id, headcountId),
        eq(headcountPlans.companyId, companyId)
      )
    );
  return parent;
}

export const PATCH = withErrorHandler(async (
  request: Request,
  { params }: { params: Promise<{ id: string; grantId: string }> }
) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;
  const { id: headcountId, grantId } = await params;

  const parent = await verifyParent(headcountId, ctx.companyId);
  if (!parent) return errorResponse("Headcount not found", 404);

  const scenarioId = getActiveScenario(request);
  const parsed = await parseBody(request, updateEquityGrantSchema);
  if ("error" in parsed) return parsed.error;

  const changes: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.shares !== undefined) changes.shares = parsed.data.shares.toFixed(4);
  if (parsed.data.strikePrice !== undefined) {
    changes.strikePrice =
      parsed.data.strikePrice === null ? null : parsed.data.strikePrice.toFixed(4);
  }

  const row = await updateEquityGrant(grantId, changes, scenarioId, ctx.companyId);
  if (!row) return errorResponse("Equity grant not found", 404);
  await logAudit(ctx, "equity_grant", grantId, "update", { after: row });
  await trackDataMutation(ctx.companyId, "headcount");
  revalidateTag("headcount-plans", { expire: 0 });
  revalidateTag("scenario-overrides", { expire: 0 });
  return NextResponse.json(row);
});

export const DELETE = withErrorHandler(async (
  request: Request,
  { params }: { params: Promise<{ id: string; grantId: string }> }
) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "admin");
  if (roleErr) return roleErr;
  const { id: headcountId, grantId } = await params;

  const parent = await verifyParent(headcountId, ctx.companyId);
  if (!parent) return errorResponse("Headcount not found", 404);

  const scenarioId = getActiveScenario(request);
  const ok = await removeEquityGrant(grantId, scenarioId, ctx.companyId);
  if (!ok) return errorResponse("Equity grant not found", 404);
  await logAudit(ctx, "equity_grant", grantId, "delete", {});
  await trackDataMutation(ctx.companyId, "headcount");
  revalidateTag("headcount-plans", { expire: 0 });
  revalidateTag("scenario-overrides", { expire: 0 });
  return NextResponse.json({ deleted: true });
});
