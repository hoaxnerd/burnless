import { NextResponse } from "next/server";
import { z } from "zod";
import { db, headcountPlans, scenarios } from "@burnless/db";
import { eq, and } from "drizzle-orm";
import { requireCompanyAccess, requireRole, parseBody, errorResponse, withErrorHandler } from "@/lib/api-helpers";

const createSchema = z.object({
  scenarioId: z.string(),
  departmentId: z.string(),
  title: z.string().min(1),
  count: z.number().int().min(1).default(1),
  salary: z.number().min(0),
  startDate: z.string().transform((s) => new Date(s)),
  endDate: z.string().nullable().default(null).transform((s) => (s ? new Date(s) : null)),
  benefitsRate: z.number().min(0).max(1).default(0.20),
});

export const GET = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const url = new URL(request.url);
  const scenarioId = url.searchParams.get("scenarioId");
  if (!scenarioId) return errorResponse("scenarioId required", 400);

  const [scenario] = await db.select().from(scenarios)
    .where(and(eq(scenarios.id, scenarioId), eq(scenarios.companyId, ctx.companyId)));
  if (!scenario) return errorResponse("Scenario not found", 404);

  const rows = await db.select().from(headcountPlans).where(eq(headcountPlans.scenarioId, scenarioId));
  return NextResponse.json(rows);
});

export const POST = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;

  const parsed = await parseBody(request, createSchema);
  if ("error" in parsed) return parsed.error;

  const [scenario] = await db.select().from(scenarios)
    .where(and(eq(scenarios.id, parsed.data.scenarioId), eq(scenarios.companyId, ctx.companyId)));
  if (!scenario) return errorResponse("Scenario not found", 404);

  const [row] = await db.insert(headcountPlans).values({
    ...parsed.data,
    salary: String(parsed.data.salary),
    benefitsRate: String(parsed.data.benefitsRate),
  }).returning();

  return NextResponse.json(row, { status: 201 });
});
