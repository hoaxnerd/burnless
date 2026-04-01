import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db, scenarios, getOverrideCount } from "@burnless/db";
import { eq, and, gt, sql, isNull } from "drizzle-orm";
import { createScenarioSchema } from "@burnless/types";
import { requireCompanyAccess, requireRole, parseBody, requirePlanFeature, withErrorHandler } from "@/lib/api-helpers";
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
      ? and(eq(scenarios.companyId, ctx.companyId), gt(scenarios.id, cursor), isNull(scenarios.deletedAt))
      : and(eq(scenarios.companyId, ctx.companyId), isNull(scenarios.deletedAt));
    const rows = await db.select().from(scenarios).where(where).orderBy(scenarios.createdAt).limit(limit + 1);

    // Attach override counts
    const withCounts = await Promise.all(
      rows.map(async (s) => ({
        ...s,
        overrideCount: await getOverrideCount(s.id),
      }))
    );
    return NextResponse.json(paginatedResponse(withCounts, limit));
  }

  const rows = await db
    .select()
    .from(scenarios)
    .where(and(eq(scenarios.companyId, ctx.companyId), isNull(scenarios.deletedAt)))
    .orderBy(scenarios.createdAt);

  // Attach override counts
  const withCounts = await Promise.all(
    rows.map(async (s) => ({
      ...s,
      overrideCount: await getOverrideCount(s.id),
    }))
  );

  return NextResponse.json(withCounts);
});

export const POST = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;

  // Feature gate: check scenario limit (COUNT(*) — never load all rows)
  const countResult = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(scenarios)
    .where(and(eq(scenarios.companyId, ctx.companyId), isNull(scenarios.deletedAt)));
  const scenarioCount = countResult[0]?.count ?? 0;
  const gateErr = await requirePlanFeature(ctx.companyId, "create_scenario", scenarioCount);
  if (gateErr) return gateErr;

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
