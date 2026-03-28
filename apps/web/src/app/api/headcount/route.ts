import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db, headcountPlans, scenarios } from "@burnless/db";
import { eq, and, gt, isNull } from "drizzle-orm";
import { createHeadcountSchema } from "@burnless/types";
import { requireCompanyAccess, requireRole, parseBody, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { parsePaginationParams, paginatedResponse } from "@/lib/pagination";
import { logAudit } from "@/lib/audit";
import { trackDataMutation } from "@/lib/data-mutation-tracker";

export const GET = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const url = new URL(request.url);
  const scenarioId = url.searchParams.get("scenarioId");
  if (!scenarioId) return errorResponse("scenarioId required", 400);

  const [scenario] = await db.select().from(scenarios)
    .where(and(eq(scenarios.id, scenarioId), eq(scenarios.companyId, ctx.companyId), isNull(scenarios.deletedAt)));
  if (!scenario) return errorResponse("Scenario not found", 404);

  const usePagination = url.searchParams.has("limit");

  if (usePagination) {
    const { limit, cursor } = parsePaginationParams(request);
    const where = cursor
      ? and(eq(headcountPlans.scenarioId, scenarioId), gt(headcountPlans.id, cursor))
      : eq(headcountPlans.scenarioId, scenarioId);
    const rows = await db.select().from(headcountPlans).where(where).limit(limit + 1);
    return NextResponse.json(paginatedResponse(rows, limit));
  }

  const rows = await db.select().from(headcountPlans).where(eq(headcountPlans.scenarioId, scenarioId));
  return NextResponse.json(rows);
});

export const POST = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;

  const parsed = await parseBody(request, createHeadcountSchema);
  if ("error" in parsed) return parsed.error;

  const [scenario] = await db.select().from(scenarios)
    .where(and(eq(scenarios.id, parsed.data.scenarioId), eq(scenarios.companyId, ctx.companyId), isNull(scenarios.deletedAt)));
  if (!scenario) return errorResponse("Scenario not found", 404);

  const [row] = await db.insert(headcountPlans).values({
    ...parsed.data,
    salary: String(parsed.data.salary),
    benefitsRate: String(parsed.data.benefitsRate),
  }).returning();

  if (row) await logAudit(ctx, "headcount_plan", row.id, "create", { after: row });
  await trackDataMutation(ctx.companyId, "headcount");
  revalidateTag("headcount-plans");
  return NextResponse.json(row, { status: 201 });
});
