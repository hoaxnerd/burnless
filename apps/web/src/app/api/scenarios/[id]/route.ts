import { NextResponse } from "next/server";
import { z } from "zod";
import { db, scenarios } from "@burnless/db";
import { eq, and } from "drizzle-orm";
import { requireCompanyAccess, requireRole, parseBody, errorResponse } from "@/lib/api-helpers";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(["base", "best", "worst", "custom"]).optional(),
  isDefault: z.boolean().optional(),
  isBudget: z.boolean().optional(),
  description: z.string().nullable().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;

  const [row] = await db
    .select()
    .from(scenarios)
    .where(and(eq(scenarios.id, id), eq(scenarios.companyId, ctx.companyId)));

  if (!row) return errorResponse("Scenario not found", 404);
  return NextResponse.json(row);
}

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

  // If locking as budget, set budgetLockedAt
  const updates: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.isBudget === true) {
    updates.budgetLockedAt = new Date();
  } else if (parsed.data.isBudget === false) {
    updates.budgetLockedAt = null;
  }

  const [row] = await db
    .update(scenarios)
    .set(updates)
    .where(and(eq(scenarios.id, id), eq(scenarios.companyId, ctx.companyId)))
    .returning();

  if (!row) return errorResponse("Scenario not found", 404);
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

  const [row] = await db
    .delete(scenarios)
    .where(and(eq(scenarios.id, id), eq(scenarios.companyId, ctx.companyId)))
    .returning();

  if (!row) return errorResponse("Scenario not found", 404);
  return NextResponse.json({ deleted: true });
}
