import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db, revenueStreams, resolveEntities, scenarioInsert } from "@burnless/db";
import { eq, and, gt } from "drizzle-orm";
import { createRevenueStreamSchema } from "@burnless/types";
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

  // Fetch base revenue streams for the company
  const base = await db
    .select()
    .from(revenueStreams)
    .where(eq(revenueStreams.companyId, ctx.companyId));

  // Resolve with scenario overrides
  const resolved = await resolveEntities("revenue_stream", base, scenarioId);

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

  const parsed = await parseBody(request, createRevenueStreamSchema);
  if ("error" in parsed) return parsed.error;

  const data = { ...parsed.data, companyId: ctx.companyId };
  const row = await scenarioInsert("revenue_stream", revenueStreams, data, scenarioId);

  if (row) await logAudit(ctx, "revenue_stream", row.id, "create", { after: row });
  await trackDataMutation(ctx.companyId, "revenue");
  revalidateTag("revenue-streams");
  return NextResponse.json(row, { status: 201 });
});
