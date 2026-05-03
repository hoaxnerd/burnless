import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import {
  db,
  headcountPlans,
  updateSalaryChange,
  removeSalaryChange,
} from "@burnless/db";
import { and, eq } from "drizzle-orm";
import { updateSalaryChangeSchema } from "@burnless/types";
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
  { params }: { params: Promise<{ id: string; changeId: string }> }
) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;
  const { id: headcountId, changeId } = await params;

  const parent = await verifyParent(headcountId, ctx.companyId);
  if (!parent) return errorResponse("Headcount not found", 404);

  const scenarioId = getActiveScenario(request);
  const parsed = await parseBody(request, updateSalaryChangeSchema);
  if ("error" in parsed) return parsed.error;

  const changes: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.newSalary !== undefined) changes.newSalary = String(parsed.data.newSalary);

  const row = await updateSalaryChange(changeId, changes, scenarioId);
  if (!row) return errorResponse("Salary change not found", 404);
  await logAudit(ctx, "salary_change", changeId, "update", { after: row });
  await trackDataMutation(ctx.companyId, "headcount");
  revalidateTag("headcount-plans");
  revalidateTag("scenario-overrides");
  return NextResponse.json(row);
});

export const DELETE = withErrorHandler(async (
  request: Request,
  { params }: { params: Promise<{ id: string; changeId: string }> }
) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "admin");
  if (roleErr) return roleErr;
  const { id: headcountId, changeId } = await params;

  const parent = await verifyParent(headcountId, ctx.companyId);
  if (!parent) return errorResponse("Headcount not found", 404);

  const scenarioId = getActiveScenario(request);
  await removeSalaryChange(changeId, scenarioId);
  await logAudit(ctx, "salary_change", changeId, "delete", {});
  await trackDataMutation(ctx.companyId, "headcount");
  revalidateTag("headcount-plans");
  revalidateTag("scenario-overrides");
  return NextResponse.json({ deleted: true });
});
