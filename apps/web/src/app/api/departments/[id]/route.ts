import { NextResponse } from "next/server";
import { z } from "zod";
import { db, departments } from "@burnless/db";
import { eq, and } from "drizzle-orm";
import { requireCompanyAccess, parseBody, errorResponse } from "@/lib/api-helpers";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  parentId: z.string().nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;

  const parsed = await parseBody(request, updateSchema);
  if ("error" in parsed) return parsed.error;

  const [row] = await db.update(departments).set(parsed.data)
    .where(and(eq(departments.id, id), eq(departments.companyId, ctx.companyId))).returning();

  if (!row) return errorResponse("Department not found", 404);
  return NextResponse.json(row);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;

  const [row] = await db.delete(departments)
    .where(and(eq(departments.id, id), eq(departments.companyId, ctx.companyId))).returning();

  if (!row) return errorResponse("Department not found", 404);
  return NextResponse.json({ deleted: true });
}
