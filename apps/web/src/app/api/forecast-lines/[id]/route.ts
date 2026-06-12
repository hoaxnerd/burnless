import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db, forecastLines, scenarioUpdate, scenarioDelete } from "@burnless/db";
import { eq } from "drizzle-orm";
import { updateForecastLineSchema } from "@burnless/types";
import { validateFormula } from "@burnless/engine";
import { requireCompanyAccess, requireRole, parseBody, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { trackDataMutation } from "@/lib/data-mutation-tracker";
import { getActiveScenario } from "@/lib/scenario-middleware";

export const PATCH = withErrorHandler(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;
  const { id } = await params;

  const scenarioId = getActiveScenario(request);

  const parsed = await parseBody(request, updateForecastLineSchema);
  if ("error" in parsed) return parsed.error;

  // VAL-02 + Phase 4 §4.4: validate a custom_formula expression at the boundary,
  // but only when one is actually present in this update payload. Every reference
  // must resolve to a known company line name (excluding this line itself).
  if (parsed.data.method === "custom_formula") {
    const expression = (parsed.data.parameters as Record<string, unknown> | undefined)?.expression;
    if (typeof expression === "string") {
      const nameRows = await db
        .select({ id: forecastLines.id, name: forecastLines.name })
        .from(forecastLines)
        .where(eq(forecastLines.companyId, ctx.companyId));
      const knownNames = new Set(
        nameRows
          .filter((r) => r.id !== id)
          .map((r) => r.name)
          .filter((n): n is string => !!n)
      );
      const reason = validateFormula(expression, knownNames);
      if (reason) return errorResponse(`Invalid formula: ${reason}`, 400);
    }
  }

  const row = await scenarioUpdate("forecast_line", forecastLines, id, parsed.data, scenarioId, ctx.companyId);
  if (!row) return errorResponse("Forecast line not found", 404);
  await logAudit(ctx, "forecast_line", id, "update", { after: row });
  await trackDataMutation(ctx.companyId, "forecast-lines");
  revalidateTag("forecast-lines", { expire: 0 });
  revalidateTag("scenario-overrides", { expire: 0 }); // Phase 4 A §A1: keep overlay cache in sync
  revalidateTag("expense-details", { expire: 0 }); // refetch the server-rendered expense table
  revalidateTag("dashboard", { expire: 0 }); // KPIs blend forecast lines
  return NextResponse.json(row);
});

export const DELETE = withErrorHandler(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "admin");
  if (roleErr) return roleErr;
  const { id } = await params;

  const scenarioId = getActiveScenario(request);

  const ok = await scenarioDelete("forecast_line", forecastLines, id, scenarioId, ctx.companyId);
  if (!ok) return errorResponse("Forecast line not found", 404);
  await logAudit(ctx, "forecast_line", id, "delete", {});
  await trackDataMutation(ctx.companyId, "forecast-lines");
  revalidateTag("forecast-lines", { expire: 0 });
  revalidateTag("scenario-overrides", { expire: 0 }); // Phase 4 A §A1: keep overlay cache in sync
  revalidateTag("expense-details", { expire: 0 }); // refetch the server-rendered expense table
  revalidateTag("dashboard", { expire: 0 }); // KPIs blend forecast lines
  return NextResponse.json({ deleted: true });
});
