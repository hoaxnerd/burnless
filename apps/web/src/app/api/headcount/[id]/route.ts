import { NextResponse } from "next/server";
import { z } from "zod";
import { db, headcountPlans, scenarios } from "@burnless/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireCompanyAccess, requireRole, parseBody, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { positiveAmount, ratio } from "@/lib/financial-validation";
import { logAudit } from "@/lib/audit";

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  count: z.number().int().min(1).optional(),
  salary: positiveAmount().optional(),
  startDate: z.string().transform((s) => new Date(s)).optional(),
  endDate: z.string().nullable().transform((s) => (s ? new Date(s) : null)).optional(),
  benefitsRate: ratio().optional(),
});

/** Subquery: scenario IDs belonging to the authenticated company */
function companyScenarioIds(companyId: string) {
  return db.select({ id: scenarios.id }).from(scenarios).where(eq(scenarios.companyId, companyId));
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

  const parsed = await parseBody(request, updateSchema);
  if ("error" in parsed) return parsed.error;

  const updates: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.salary !== undefined) updates.salary = String(parsed.data.salary);
  if (parsed.data.benefitsRate !== undefined) updates.benefitsRate = String(parsed.data.benefitsRate);

  const [row] = await db.update(headcountPlans).set(updates).where(and(eq(headcountPlans.id, id), inArray(headcountPlans.scenarioId, companyScenarioIds(ctx.companyId)))).returning();
  if (!row) return errorResponse("Headcount plan not found", 404);
  await logAudit(ctx, "headcount_plan", id, "update", { after: row });
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
  return NextResponse.json({ deleted: true });
});
