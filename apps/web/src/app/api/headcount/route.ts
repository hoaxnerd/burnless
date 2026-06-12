import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db, headcountPlans, resolveEntities, scenarioInsert } from "@burnless/db";
import { eq, and, gt } from "drizzle-orm";
import { createHeadcountSchema } from "@burnless/types";
import { requireCompanyAccess, requireRole, parseBody, withErrorHandler } from "@/lib/api-helpers";
import { parsePaginationParams, paginatedResponse } from "@/lib/pagination";
import { logAudit } from "@/lib/audit";
import { trackDataMutation } from "@/lib/data-mutation-tracker";
import { getActiveScenario } from "@/lib/scenario-middleware";

export const GET = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const url = new URL(request.url);
  const scenarioId = getActiveScenario(request);

  // Fetch base headcount plans for the company
  const base = await db
    .select()
    .from(headcountPlans)
    .where(eq(headcountPlans.companyId, ctx.companyId));

  // Resolve with scenario overrides
  const resolved = await resolveEntities("headcount_plan", base, scenarioId);

  const usePagination = url.searchParams.has("limit");
  if (usePagination) {
    const { limit, cursor } = parsePaginationParams(request);
    const filtered = cursor ? resolved.filter((r) => r.id > cursor) : resolved;
    return NextResponse.json(paginatedResponse(filtered.slice(0, limit + 1), limit));
  }

  return NextResponse.json(resolved);
});

export const POST = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;

  const scenarioId = getActiveScenario(request);

  const parsed = await parseBody(request, createHeadcountSchema);
  if ("error" in parsed) return parsed.error;

  const data: Record<string, unknown> = {
    ...parsed.data,
    companyId: ctx.companyId,
    salary: String(parsed.data.salary),
    benefitsRate: String(parsed.data.benefitsRate),
    count: parsed.data.count.toFixed(2),
  };
  if (parsed.data.hourlyRate !== undefined) {
    data.hourlyRate = parsed.data.hourlyRate === null ? null : String(parsed.data.hourlyRate);
  }
  if (parsed.data.hoursPerWeek !== undefined) {
    data.hoursPerWeek = parsed.data.hoursPerWeek === null ? null : String(parsed.data.hoursPerWeek);
  }
  const row = await scenarioInsert("headcount_plan", headcountPlans, data, scenarioId, ctx.companyId);

  if (row) await logAudit(ctx, "headcount_plan", row.id, "create", { after: row });
  await trackDataMutation(ctx.companyId, "headcount");
  revalidateTag("headcount-plans", { expire: 0 });
  revalidateTag("scenario-overrides", { expire: 0 }); // Phase 4 A §A1 — tag parity with data.ts
  return NextResponse.json(row, { status: 201 });
});
