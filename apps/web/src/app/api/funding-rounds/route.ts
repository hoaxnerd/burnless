import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { db, fundingRounds } from "@burnless/db";
import { eq, and, gt } from "drizzle-orm";
import { requireCompanyAccess, requireRole, parseBody, withErrorHandler } from "@/lib/api-helpers";
import { parsePaginationParams, paginatedResponse } from "@/lib/pagination";
import { positiveAmount, percentage } from "@/lib/financial-validation";
import { logAudit } from "@/lib/audit";

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["pre_seed", "seed", "series_a", "series_b", "series_c_plus", "debt", "grant"]),
  amount: positiveAmount(),
  date: z.string().transform((s) => new Date(s)),
  preMoneyValuation: positiveAmount().nullable().default(null),
  dilutionPercent: percentage().nullable().default(null),
  isProjected: z.boolean().default(false),
});

export const GET = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const url = new URL(request.url);
  const usePagination = url.searchParams.has("limit");

  if (usePagination) {
    const { limit, cursor } = parsePaginationParams(request);
    const where = cursor
      ? and(eq(fundingRounds.companyId, ctx.companyId), gt(fundingRounds.id, cursor))
      : eq(fundingRounds.companyId, ctx.companyId);
    const rows = await db.select().from(fundingRounds).where(where).limit(limit + 1);
    return NextResponse.json(paginatedResponse(rows, limit));
  }

  const rows = await db
    .select()
    .from(fundingRounds)
    .where(eq(fundingRounds.companyId, ctx.companyId));
  return NextResponse.json(rows);
});

export const POST = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;

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

  if (row) await logAudit(ctx, "funding_round", row.id, "create", { after: row });
  revalidateTag("funding-rounds");
  return NextResponse.json(row, { status: 201 });
});
