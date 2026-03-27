import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db, scenarios } from "@burnless/db";
import { eq, and, gt, sql } from "drizzle-orm";
import { createScenarioSchema } from "@burnless/types";
import { requireCompanyAccess, requireRole, getCompanyPlan, parseBody, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { canPerformAction } from "@/lib/feature-gate";
import { parsePaginationParams, paginatedResponse } from "@/lib/pagination";
import { logAudit } from "@/lib/audit";
import { trackDataMutation } from "@/lib/data-mutation-tracker";

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

  // Feature gate: check scenario limit (COUNT(*) — never load all rows)
  const plan = await getCompanyPlan(ctx.companyId);
  const [{ count: scenarioCount }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(scenarios)
    .where(eq(scenarios.companyId, ctx.companyId));
  const gate = canPerformAction(plan, "create_scenario", scenarioCount);
  if (!gate.allowed) return errorResponse(gate.reason!, 403);

  const parsed = await parseBody(request, createScenarioSchema);
  if ("error" in parsed) return parsed.error;

  const [row] = await db
    .insert(scenarios)
    .values({
      companyId: ctx.companyId,
      ...parsed.data,
    })
    .returning();

  if (row) await logAudit(ctx, "scenario", row.id, "create", { after: row });
  await trackDataMutation(ctx.companyId, "scenarios");
  revalidateTag("scenarios");
  return NextResponse.json(row, { status: 201 });
});
