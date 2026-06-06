import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db, forecastLines, resolveEntities, scenarioInsert } from "@burnless/db";
import { eq, and, lt } from "drizzle-orm";
import { createForecastLineSchema } from "@burnless/types";
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

  // Fetch base forecast lines for the company
  const base = await db
    .select()
    .from(forecastLines)
    .where(eq(forecastLines.companyId, ctx.companyId));

  // Resolve with scenario overrides
  const resolved = await resolveEntities("forecast_line", base, scenarioId);

  const { limit, cursor } = parsePaginationParams(request);
  const filtered = cursor ? resolved.filter((r) => r.id < cursor) : resolved;
  return NextResponse.json(paginatedResponse(filtered.slice(0, limit + 1), limit));
});

export const POST = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;

  const scenarioId = getActiveScenario(request);

  const parsed = await parseBody(request, createForecastLineSchema);
  if ("error" in parsed) return parsed.error;

  const data = { ...parsed.data, companyId: ctx.companyId };
  const row = await scenarioInsert("forecast_line", forecastLines, data, scenarioId, ctx.companyId);

  if (row) await logAudit(ctx, "forecast_line", row.id, "create", { after: row });
  await trackDataMutation(ctx.companyId, "forecast-lines");
  revalidateTag("forecast-lines");
  revalidateTag("scenario-overrides"); // Phase 4 A §A1: keep overlay cache in sync
  return NextResponse.json(row, { status: 201 });
});
