import { NextResponse } from "next/server";
import { z } from "zod";
import { db, forecastLines } from "@burnless/db";
import { eq } from "drizzle-orm";
import { requireCompanyAccess, requireRole, parseBody, errorResponse } from "@/lib/api-helpers";

const updateSchema = z.object({
  method: z.enum(["fixed", "growth_rate", "per_unit", "percentage_of", "custom_formula"]).optional(),
  parameters: z.record(z.unknown()).optional(),
  startDate: z.string().transform((s) => new Date(s)).optional(),
  endDate: z.string().nullable().transform((s) => (s ? new Date(s) : null)).optional(),
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

  const [row] = await db
    .update(forecastLines)
    .set(parsed.data)
    .where(eq(forecastLines.id, id))
    .returning();

  if (!row) return errorResponse("Forecast line not found", 404);
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

  const [row] = await db.delete(forecastLines).where(eq(forecastLines.id, id)).returning();
  if (!row) return errorResponse("Forecast line not found", 404);
  return NextResponse.json({ deleted: true });
}
