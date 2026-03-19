import { NextResponse } from "next/server";
import { z } from "zod";
import { db, revenueStreams } from "@burnless/db";
import { eq } from "drizzle-orm";
import { requireCompanyAccess, parseBody, errorResponse } from "@/lib/api-helpers";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(["subscription", "one_time", "usage_based", "services"]).optional(),
  parameters: z.record(z.unknown()).optional(),
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

  const [row] = await db.update(revenueStreams).set(parsed.data).where(eq(revenueStreams.id, id)).returning();
  if (!row) return errorResponse("Revenue stream not found", 404);
  return NextResponse.json(row);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;

  const [row] = await db.delete(revenueStreams).where(eq(revenueStreams.id, id)).returning();
  if (!row) return errorResponse("Revenue stream not found", 404);
  return NextResponse.json({ deleted: true });
}
