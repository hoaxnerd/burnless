import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db, forecastLines, scenarios } from "@burnless/db";
import { eq, and, inArray } from "drizzle-orm";
import { updateForecastLineSchema } from "@burnless/types";
import { requireCompanyAccess, requireRole, parseBody, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { trackDataMutation } from "@/lib/data-mutation-tracker";

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

  const parsed = await parseBody(request, updateForecastLineSchema);
  if ("error" in parsed) return parsed.error;

  const [row] = await db
    .update(forecastLines)
    .set(parsed.data)
    .where(and(eq(forecastLines.id, id), inArray(forecastLines.scenarioId, companyScenarioIds(ctx.companyId))))
    .returning();

  if (!row) return errorResponse("Forecast line not found", 404);
  await logAudit(ctx, "forecast_line", id, "update", { after: row });
  await trackDataMutation(ctx.companyId, "forecast-lines");
  revalidateTag("forecast-lines");
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

  const [row] = await db.delete(forecastLines).where(and(eq(forecastLines.id, id), inArray(forecastLines.scenarioId, companyScenarioIds(ctx.companyId)))).returning();
  if (!row) return errorResponse("Forecast line not found", 404);
  await logAudit(ctx, "forecast_line", id, "delete", { before: row });
  await trackDataMutation(ctx.companyId, "forecast-lines");
  revalidateTag("forecast-lines");
  return NextResponse.json({ deleted: true });
});
