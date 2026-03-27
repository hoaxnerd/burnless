import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db, headcountPlans, scenarios } from "@burnless/db";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { updateHeadcountSchema } from "@burnless/types";
import { requireCompanyAccess, requireRole, parseBody, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { trackDataMutation } from "@/lib/data-mutation-tracker";

/** Subquery: scenario IDs belonging to the authenticated company */
function companyScenarioIds(companyId: string) {
  return db.select({ id: scenarios.id }).from(scenarios).where(and(eq(scenarios.companyId, companyId), isNull(scenarios.deletedAt)));
}

export const PATCH = withErrorHandler(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;
  const { id } = await params;

  const parsed = await parseBody(request, updateHeadcountSchema);
  if ("error" in parsed) return parsed.error;

  const updates: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.salary !== undefined) updates.salary = String(parsed.data.salary);
  if (parsed.data.benefitsRate !== undefined) updates.benefitsRate = String(parsed.data.benefitsRate);

  const [row] = await db.update(headcountPlans).set(updates).where(and(eq(headcountPlans.id, id), inArray(headcountPlans.scenarioId, companyScenarioIds(ctx.companyId)))).returning();
  if (!row) return errorResponse("Headcount plan not found", 404);
  await logAudit(ctx, "headcount_plan", id, "update", { after: row });
  await trackDataMutation(ctx.companyId, "headcount");
  revalidateTag("headcount-plans");
  return NextResponse.json(row);
});

export const DELETE = withErrorHandler(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "admin");
  if (roleErr) return roleErr;
  const { id } = await params;

  const [row] = await db.delete(headcountPlans).where(and(eq(headcountPlans.id, id), inArray(headcountPlans.scenarioId, companyScenarioIds(ctx.companyId)))).returning();
  if (!row) return errorResponse("Headcount plan not found", 404);
  await logAudit(ctx, "headcount_plan", id, "delete", { before: row });
  await trackDataMutation(ctx.companyId, "headcount");
  revalidateTag("headcount-plans");
  return NextResponse.json({ deleted: true });
});
