import { NextResponse } from "next/server";
import { z } from "zod";
import { db, forecastLines, forecastValues, scenarios } from "@burnless/db";
import { eq, and } from "drizzle-orm";
import { requireCompanyAccess, parseBody, errorResponse } from "@/lib/api-helpers";

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

  const rows = await db.select().from(forecastLines).where(eq(forecastLines.scenarioId, scenarioId));
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

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
