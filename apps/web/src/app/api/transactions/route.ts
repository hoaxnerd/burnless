import { NextResponse } from "next/server";
import { z } from "zod";
import { db, transactions } from "@burnless/db";
import { eq, and, gte, lte, gt } from "drizzle-orm";
import { requireCompanyAccess, errorResponse, parseBody, withErrorHandler } from "@/lib/api-helpers";
import { parsePaginationParams, paginatedResponse } from "@/lib/pagination";
import { monetaryAmount } from "@/lib/financial-validation";
import { logAudit } from "@/lib/audit";
import { trackDataMutation } from "@/lib/data-mutation-tracker";
import { parseISODate } from "@/lib/date-validation";

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
  const startDateStr = url.searchParams.get("startDate");
  const endDateStr = url.searchParams.get("endDate");
  const { limit, cursor } = parsePaginationParams(request);

  const conditions = [eq(transactions.companyId, ctx.companyId)];
  if (accountId) conditions.push(eq(transactions.accountId, accountId));
  if (startDateStr) {
    const d = parseISODate(startDateStr);
    if (!d) return errorResponse("Invalid startDate format. Expected YYYY-MM-DD.", 400);
    conditions.push(gte(transactions.date, d));
  }
  if (endDateStr) {
    const d = parseISODate(endDateStr);
    if (!d) return errorResponse("Invalid endDate format. Expected YYYY-MM-DD.", 400);
    conditions.push(lte(transactions.date, d));
  }
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
  await trackDataMutation(ctx.companyId, "expenses");
  return NextResponse.json(row, { status: 201 });
});
