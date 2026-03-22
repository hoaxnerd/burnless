import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { db, revenueStreams, scenarios } from "@burnless/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireCompanyAccess, requireRole, parseBody, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(["subscription", "one_time", "usage_based", "services"]).optional(),
  parameters: z.record(z.unknown()).optional(),
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

  const [row] = await db.update(revenueStreams).set(parsed.data).where(and(eq(revenueStreams.id, id), inArray(revenueStreams.scenarioId, companyScenarioIds(ctx.companyId)))).returning();
  if (!row) return errorResponse("Revenue stream not found", 404);
  await logAudit(ctx, "revenue_stream", id, "update", { after: row });
  revalidateTag("revenue-streams");
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

  const [row] = await db.delete(revenueStreams).where(and(eq(revenueStreams.id, id), inArray(revenueStreams.scenarioId, companyScenarioIds(ctx.companyId)))).returning();
  if (!row) return errorResponse("Revenue stream not found", 404);
  await logAudit(ctx, "revenue_stream", id, "delete", { before: row });
  revalidateTag("revenue-streams");
  return NextResponse.json({ deleted: true });
});
