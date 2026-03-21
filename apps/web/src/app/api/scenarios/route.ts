import { NextResponse } from "next/server";
import { z } from "zod";
import { db, scenarios } from "@burnless/db";
import { eq, and, gt } from "drizzle-orm";
import { requireCompanyAccess, requireRole, getCompanyPlan, parseBody, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { canPerformAction } from "@/lib/feature-gate";
import { parsePaginationParams, paginatedResponse } from "@/lib/pagination";

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["base", "best", "worst", "custom"]).default("custom"),
  isDefault: z.boolean().default(false),
  description: z.string().nullable().default(null),
});

export const GET = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const url = new URL(request.url);
  const usePagination = url.searchParams.has("limit");

  if (usePagination) {
    const { limit, cursor } = parsePaginationParams(request);
    const where = cursor
      ? and(eq(scenarios.companyId, ctx.companyId), gt(scenarios.id, cursor))
      : eq(scenarios.companyId, ctx.companyId);
    const rows = await db.select().from(scenarios).where(where).orderBy(scenarios.createdAt).limit(limit + 1);
    return NextResponse.json(paginatedResponse(rows, limit));
  }

  const rows = await db
    .select()
    .from(scenarios)
    .where(eq(scenarios.companyId, ctx.companyId))
    .orderBy(scenarios.createdAt);

  return NextResponse.json(rows);
});

export const POST = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;

  // Feature gate: check scenario limit
  const plan = await getCompanyPlan(ctx.companyId);
  const currentCount = await db
    .select()
    .from(scenarios)
    .where(eq(scenarios.companyId, ctx.companyId));
  const gate = canPerformAction(plan, "create_scenario", currentCount.length);
  if (!gate.allowed) return errorResponse(gate.reason!, 403);

  const parsed = await parseBody(request, createSchema);
  if ("error" in parsed) return parsed.error;

  const [row] = await db
    .insert(scenarios)
    .values({
      companyId: ctx.companyId,
      ...parsed.data,
    })
    .returning();

  return NextResponse.json(row, { status: 201 });
});
