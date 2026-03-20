import { NextResponse } from "next/server";
import { z } from "zod";
import { db, headcountPlans } from "@burnless/db";
import { eq } from "drizzle-orm";
import { requireCompanyAccess, requireRole, parseBody, errorResponse } from "@/lib/api-helpers";

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  count: z.number().int().min(1).optional(),
  salary: z.number().min(0).optional(),
  startDate: z.string().transform((s) => new Date(s)).optional(),
  endDate: z.string().nullable().transform((s) => (s ? new Date(s) : null)).optional(),
  benefitsRate: z.number().min(0).max(1).optional(),
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
  if (parsed.data.salary !== undefined) updates.salary = String(parsed.data.salary);
  if (parsed.data.benefitsRate !== undefined) updates.benefitsRate = String(parsed.data.benefitsRate);

  const [row] = await db.update(headcountPlans).set(updates).where(eq(headcountPlans.id, id)).returning();
  if (!row) return errorResponse("Headcount plan not found", 404);
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

  const [row] = await db.delete(headcountPlans).where(eq(headcountPlans.id, id)).returning();
  if (!row) return errorResponse("Headcount plan not found", 404);
  return NextResponse.json({ deleted: true });
}
