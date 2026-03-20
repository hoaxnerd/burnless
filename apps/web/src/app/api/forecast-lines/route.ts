import { NextResponse } from "next/server";
import { z } from "zod";
import { db, forecastLines, forecastValues, scenarios } from "@burnless/db";
import { eq, and, lt } from "drizzle-orm";
import { requireCompanyAccess, requireRole, parseBody, errorResponse } from "@/lib/api-helpers";
import { parsePaginationParams, paginatedResponse } from "@/lib/pagination";

const createSchema = z.object({
  scenarioId: z.string(),
  accountId: z.string(),
  method: z.enum(["fixed", "growth_rate", "per_unit", "percentage_of", "custom_formula"]).default("fixed"),
  parameters: z.record(z.unknown()).default({}),
  startDate: z.string().transform((s) => new Date(s)),
  endDate: z.string().nullable().default(null).transform((s) => (s ? new Date(s) : null)),
});

export async function GET(request: Request) {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const url = new URL(request.url);
  const scenarioId = url.searchParams.get("scenarioId");
  if (!scenarioId) return errorResponse("scenarioId required", 400);

  // Verify scenario belongs to company
  const [scenario] = await db
    .select()
    .from(scenarios)
    .where(and(eq(scenarios.id, scenarioId), eq(scenarios.companyId, ctx.companyId)));
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
}

export async function POST(request: Request) {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;

  const parsed = await parseBody(request, createSchema);
  if ("error" in parsed) return parsed.error;

  // Verify scenario belongs to company
  const [scenario] = await db
    .select()
    .from(scenarios)
    .where(and(eq(scenarios.id, parsed.data.scenarioId), eq(scenarios.companyId, ctx.companyId)));
  if (!scenario) return errorResponse("Scenario not found", 404);

  const [row] = await db
    .insert(forecastLines)
    .values(parsed.data)
    .returning();

  return NextResponse.json(row, { status: 201 });
}
