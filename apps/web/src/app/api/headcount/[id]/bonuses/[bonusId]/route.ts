import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import {
  db,
  headcountPlans,
  updateBonus,
  removeBonus,
} from "@burnless/db";
import { and, eq } from "drizzle-orm";
import { updateBonusSchema } from "@burnless/types";
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
  { params }: { params: Promise<{ id: string; bonusId: string }> }
) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;
  const { id: headcountId, bonusId } = await params;

  const parent = await verifyParent(headcountId, ctx.companyId);
  if (!parent) return errorResponse("Headcount not found", 404);

  const scenarioId = getActiveScenario(request);
  const parsed = await parseBody(request, updateBonusSchema);
  if ("error" in parsed) return parsed.error;

  const changes: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.amount !== undefined) changes.amount = String(parsed.data.amount);

  const row = await updateBonus(bonusId, changes, scenarioId, ctx.companyId);
  if (!row) return errorResponse("Bonus not found", 404);
  await logAudit(ctx, "bonus", bonusId, "update", { after: row });
  await trackDataMutation(ctx.companyId, "headcount");
  revalidateTag("headcount-plans");
  revalidateTag("scenario-overrides");
  return NextResponse.json(row);
});

export const DELETE = withErrorHandler(async (
  request: Request,
  { params }: { params: Promise<{ id: string; bonusId: string }> }
) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "admin");
  if (roleErr) return roleErr;
  const { id: headcountId, bonusId } = await params;

  const parent = await verifyParent(headcountId, ctx.companyId);
  if (!parent) return errorResponse("Headcount not found", 404);

  const scenarioId = getActiveScenario(request);
  const ok = await removeBonus(bonusId, scenarioId, ctx.companyId);
  if (!ok) return errorResponse("Bonus not found", 404);
  await logAudit(ctx, "bonus", bonusId, "delete", {});
  await trackDataMutation(ctx.companyId, "headcount");
  revalidateTag("headcount-plans");
  revalidateTag("scenario-overrides");
  return NextResponse.json({ deleted: true });
});
