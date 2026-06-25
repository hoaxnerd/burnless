import { NextResponse } from "next/server";
import { db, transactions, financialAccounts } from "@burnless/db";
import { eq, and, gte, lte, gt } from "drizzle-orm";
import { requireCompanyAccess, requireCompanyWrite, errorResponse, parseBody, withErrorHandler } from "@/lib/api-helpers";
import { parsePaginationParams, paginatedResponse } from "@/lib/pagination";
import { logAudit } from "@/lib/audit";
import { trackDataMutation } from "@/lib/data-mutation-tracker";
import { parseISODate } from "@/lib/date-validation";
import { getActiveScenario } from "@/lib/scenario-middleware";
import { createSchema } from "./schemas";

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
  const ctx = await requireCompanyWrite();
  if ("error" in ctx) return ctx.error;

  // §3: transactions are actuals-only. A non-base scenario active ⇒ refuse the
  // write rather than silently landing it on base. getActiveScenario also runs
  // the dual-channel safety check (throws ScenarioSafetyError → 409).
  if (getActiveScenario(request)) {
    return errorResponse("Transactions are actuals — switch to base view to add or edit.", 409);
  }

  const parsed = await parseBody(request, createSchema);
  if ("error" in parsed) return parsed.error;

  // AUTHZ-02: verify the body-supplied accountId belongs to the caller's company.
  const accCheck = await db
    .select({ id: financialAccounts.id })
    .from(financialAccounts)
    .where(
      and(
        eq(financialAccounts.companyId, ctx.companyId),
        eq(financialAccounts.id, parsed.data.accountId),
      ),
    );
  if (accCheck.length === 0) {
    return errorResponse("accountId does not belong to your company", 403);
  }

  const [row] = await db
    .insert(transactions)
    .values({
      companyId: ctx.companyId,
      ...parsed.data,
      amount: String(parsed.data.amount),
    })
    .returning();

  if (row) await logAudit(ctx, "transaction", row.id, "create", { after: row });
  // No cache tag to invalidate: getTransactions (data.ts) is NOT cached, and
  // compute-dashboard reads it via React cache() (request-scoped), so router.refresh()
  // re-reads fresh. trackDataMutation still fires so the insight badge/countdown restale.
  await trackDataMutation(ctx.companyId, "expenses");
  return NextResponse.json(row, { status: 201 });
});
