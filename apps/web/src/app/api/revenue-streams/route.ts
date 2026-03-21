import { NextResponse } from "next/server";
import { z } from "zod";
import { db, revenueStreams, scenarios } from "@burnless/db";
import { eq, and } from "drizzle-orm";
import { requireCompanyAccess, requireRole, parseBody, errorResponse, withErrorHandler } from "@/lib/api-helpers";

const createSchema = z.object({
  scenarioId: z.string(),
  name: z.string().min(1),
  type: z.enum(["subscription", "one_time", "usage_based", "services"]).default("subscription"),
  parameters: z.record(z.unknown()).default({}),
});

export const GET = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const url = new URL(request.url);
  const scenarioId = url.searchParams.get("scenarioId");
  if (!scenarioId) return errorResponse("scenarioId required", 400);

  const [scenario] = await db
    .select()
    .from(scenarios)
    .where(and(eq(scenarios.id, scenarioId), eq(scenarios.companyId, ctx.companyId)));
  if (!scenario) return errorResponse("Scenario not found", 404);

  const rows = await db.select().from(revenueStreams).where(eq(revenueStreams.scenarioId, scenarioId));
  return NextResponse.json(rows);
});

export const POST = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;

  const parsed = await parseBody(request, createSchema);
  if ("error" in parsed) return parsed.error;

  const [scenario] = await db
    .select()
    .from(scenarios)
    .where(and(eq(scenarios.id, parsed.data.scenarioId), eq(scenarios.companyId, ctx.companyId)));
  if (!scenario) return errorResponse("Scenario not found", 404);

  const [row] = await db.insert(revenueStreams).values(parsed.data).returning();
  return NextResponse.json(row, { status: 201 });
});
