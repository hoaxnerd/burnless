import { NextResponse } from "next/server";
import { z } from "zod";
import { db, fundingRounds } from "@burnless/db";
import { eq } from "drizzle-orm";
import { requireCompanyAccess, parseBody, errorResponse } from "@/lib/api-helpers";

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["pre_seed", "seed", "series_a", "series_b", "series_c_plus", "debt", "grant"]),
  amount: z.number().min(0),
  date: z.string().transform((s) => new Date(s)),
  preMoneyValuation: z.number().nullable().default(null),
  dilutionPercent: z.number().nullable().default(null),
  isProjected: z.boolean().default(false),
});

export async function GET(request: Request) {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const rows = await db
    .select()
    .from(fundingRounds)
    .where(eq(fundingRounds.companyId, ctx.companyId));
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const parsed = await parseBody(request, createSchema);
  if ("error" in parsed) return parsed.error;

  const [row] = await db
    .insert(fundingRounds)
    .values({
      ...parsed.data,
      companyId: ctx.companyId,
      amount: String(parsed.data.amount),
      preMoneyValuation: parsed.data.preMoneyValuation != null ? String(parsed.data.preMoneyValuation) : null,
      dilutionPercent: parsed.data.dilutionPercent != null ? String(parsed.data.dilutionPercent) : null,
    })
    .returning();

  return NextResponse.json(row, { status: 201 });
}
