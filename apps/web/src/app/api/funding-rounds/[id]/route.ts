import { NextResponse } from "next/server";
import { z } from "zod";
import { db, fundingRounds } from "@burnless/db";
import { eq } from "drizzle-orm";
import { requireCompanyAccess, requireRole, parseBody, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { positiveAmount, percentage } from "@/lib/financial-validation";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(["pre_seed", "seed", "series_a", "series_b", "series_c_plus", "debt", "grant"]).optional(),
  amount: positiveAmount().optional(),
  date: z.string().transform((s) => new Date(s)).optional(),
  preMoneyValuation: positiveAmount().nullable().optional(),
  dilutionPercent: percentage().nullable().optional(),
  isProjected: z.boolean().optional(),
});

export const PATCH = withErrorHandler(async (
  request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;
  const { id } = await context.params;

  const parsed = await parseBody(request, updateSchema);
  if ("error" in parsed) return parsed.error;

  const updates: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.amount !== undefined) updates.amount = String(parsed.data.amount);
  if (parsed.data.preMoneyValuation !== undefined)
    updates.preMoneyValuation = parsed.data.preMoneyValuation != null ? String(parsed.data.preMoneyValuation) : null;
  if (parsed.data.dilutionPercent !== undefined)
    updates.dilutionPercent = parsed.data.dilutionPercent != null ? String(parsed.data.dilutionPercent) : null;

  const [row] = await db.update(fundingRounds).set(updates).where(eq(fundingRounds.id, id)).returning();
  if (!row) return errorResponse("Funding round not found", 404);
  return NextResponse.json(row);
});

export const DELETE = withErrorHandler(async (
  _request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "admin");
  if (roleErr) return roleErr;
  const { id } = await context.params;

  const [row] = await db.delete(fundingRounds).where(eq(fundingRounds.id, id)).returning();
  if (!row) return errorResponse("Funding round not found", 404);
  return NextResponse.json({ deleted: true });
});
