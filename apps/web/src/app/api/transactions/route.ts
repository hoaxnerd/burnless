import { NextResponse } from "next/server";
import { z } from "zod";
import { db, transactions } from "@burnless/db";
import { eq, and, gte, lte, gt } from "drizzle-orm";
import { requireCompanyAccess, parseBody, withErrorHandler } from "@/lib/api-helpers";
import { parsePaginationParams, paginatedResponse } from "@/lib/pagination";
import { monetaryAmount } from "@/lib/financial-validation";
import { logAudit } from "@/lib/audit";

const createSchema = z.object({
  accountId: z.string(),
  date: z.string().transform((s) => new Date(s)),
  amount: monetaryAmount(),
  description: z.string().nullable().default(null),
  source: z.enum(["manual", "import", "integration", "forecast"]).default("manual"),
  externalId: z.string().nullable().default(null),
  metadata: z.record(z.unknown()).nullable().default(null),
});

export const GET = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const url = new URL(request.url);
  const accountId = url.searchParams.get("accountId");
  const startDate = url.searchParams.get("startDate");
  const endDate = url.searchParams.get("endDate");
  const { limit, cursor } = parsePaginationParams(request);

  const conditions = [eq(transactions.companyId, ctx.companyId)];
  if (accountId) conditions.push(eq(transactions.accountId, accountId));
  if (startDate) conditions.push(gte(transactions.date, new Date(startDate)));
  if (endDate) conditions.push(lte(transactions.date, new Date(endDate)));
  if (cursor) conditions.push(gt(transactions.id, cursor));

  const rows = await db
    .select()
    .from(transactions)
    .where(and(...conditions))
    .orderBy(transactions.id)
    .limit(limit + 1);

  return NextResponse.json(paginatedResponse(rows, limit));
});

export const POST = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const parsed = await parseBody(request, createSchema);
  if ("error" in parsed) return parsed.error;

  const [row] = await db
    .insert(transactions)
    .values({
      companyId: ctx.companyId,
      ...parsed.data,
      amount: String(parsed.data.amount),
    })
    .returning();

  if (row) await logAudit(ctx, "transaction", row.id, "create", { after: row });
  return NextResponse.json(row, { status: 201 });
});
