import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import {
  db,
  headcountPlans,
  listResolvedBonuses,
  createBonus,
} from "@burnless/db";
import { and, eq } from "drizzle-orm";
import { createBonusSchema } from "@burnless/types";
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
  const rows = await listResolvedBonuses(ctx.companyId, headcountId, scenarioId);
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
  const parsed = await parseBody(request, createBonusSchema);
  if ("error" in parsed) return parsed.error;

  const row = await createBonus(
    {
      companyId: ctx.companyId,
      headcountId,
      payoutMonth: parsed.data.payoutMonth,
      amount: parsed.data.amount.toFixed(2),
      type: parsed.data.type,
      notes: parsed.data.notes ?? null,
    },
    scenarioId,
    ctx.companyId
  );

  if (row) await logAudit(ctx, "bonus", row.id, "create", { after: row });
  await trackDataMutation(ctx.companyId, "headcount");
  revalidateTag("headcount-plans", { expire: 0 });
  revalidateTag("scenario-overrides", { expire: 0 });
  return NextResponse.json(row, { status: 201 });
});
