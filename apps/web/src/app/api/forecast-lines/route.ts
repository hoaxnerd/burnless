import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db, forecastLines, getScenarioForCompany } from "@burnless/db";
import { eq, and, lt } from "drizzle-orm";
import { createForecastLineSchema } from "@burnless/types";
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

  const scenario = await getScenarioForCompany(scenarioId, ctx.companyId);
  if (!scenario) return errorResponse("Scenario not found", 404);

  const { limit, cursor } = parsePaginationParams(request);

  const conditions = [eq(forecastLines.scenarioId, scenarioId)];
  if (cursor) {
    conditions.push(lt(forecastLines.id, cursor));
  }

  const rows = await db
    .select()
    .from(forecastLines)
    .where(and(...conditions))
    .limit(limit + 1);

  return NextResponse.json(paginatedResponse(rows, limit));
});

export const POST = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;

  const parsed = await parseBody(request, createForecastLineSchema);
  if ("error" in parsed) return parsed.error;

  const scenario = await getScenarioForCompany(parsed.data.scenarioId, ctx.companyId);
  if (!scenario) return errorResponse("Scenario not found", 404);

  const [row] = await db
    .insert(forecastLines)
    .values(parsed.data)
    .returning();

  if (row) await logAudit(ctx, "forecast_line", row.id, "create", { after: row });
  await trackDataMutation(ctx.companyId, "forecast-lines");
  revalidateTag("forecast-lines");
  return NextResponse.json(row, { status: 201 });
});
