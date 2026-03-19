import { NextResponse } from "next/server";
import { z } from "zod";
import { db, scenarios } from "@burnless/db";
import { eq, and } from "drizzle-orm";
import { requireCompanyAccess, parseBody, errorResponse } from "@/lib/api-helpers";

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["base", "best", "worst", "custom"]).default("custom"),
  isDefault: z.boolean().default(false),
  description: z.string().nullable().default(null),
});

export async function GET() {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const rows = await db
    .select()
    .from(scenarios)
    .where(eq(scenarios.companyId, ctx.companyId))
    .orderBy(scenarios.createdAt);

  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const parsed = await parseBody(request, createSchema);
  if ("error" in parsed) return parsed.error;

  const [row] = await db
    .insert(scenarios)
    .values({
      companyId: ctx.companyId,
      ...parsed.data,
    })
    .returning();

  return NextResponse.json(row, { status: 201 });
}
