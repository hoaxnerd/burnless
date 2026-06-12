import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import {
  db,
  headcountPlans,
  listResolvedSalaryChanges,
  createSalaryChange,
} from "@burnless/db";
import { and, eq } from "drizzle-orm";
import { createSalaryChangeSchema } from "@burnless/types";
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
  const rows = await listResolvedSalaryChanges(ctx.companyId, headcountId, scenarioId);
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
  const parsed = await parseBody(request, createSalaryChangeSchema);
  if ("error" in parsed) return parsed.error;

  const row = await createSalaryChange(
    {
      companyId: ctx.companyId,
      headcountId,
      effectiveDate: parsed.data.effectiveDate,
      newSalary: parsed.data.newSalary.toFixed(2),
      reason: parsed.data.reason ?? null,
    },
    scenarioId,
    ctx.companyId
  );

  if (row) await logAudit(ctx, "salary_change", row.id, "create", { after: row });
  await trackDataMutation(ctx.companyId, "headcount");
  revalidateTag("headcount-plans", { expire: 0 });
  revalidateTag("scenario-overrides", { expire: 0 });
  return NextResponse.json(row, { status: 201 });
});
