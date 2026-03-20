import { NextResponse } from "next/server";
import { z } from "zod";
import { db, fundingRounds } from "@burnless/db";
import { eq } from "drizzle-orm";
import { requireCompanyAccess, requireRole, parseBody, errorResponse } from "@/lib/api-helpers";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(["pre_seed", "seed", "series_a", "series_b", "series_c_plus", "debt", "grant"]).optional(),
  amount: z.number().min(0).optional(),
  date: z.string().transform((s) => new Date(s)).optional(),
  preMoneyValuation: z.number().nullable().optional(),
  dilutionPercent: z.number().nullable().optional(),
  isProjected: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;
  const { id } = await params;

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
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "admin");
  if (roleErr) return roleErr;
  const { id } = await params;

  const [row] = await db.delete(fundingRounds).where(eq(fundingRounds.id, id)).returning();
  if (!row) return errorResponse("Funding round not found", 404);
  return NextResponse.json({ deleted: true });
}
