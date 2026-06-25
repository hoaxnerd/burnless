import { NextResponse } from "next/server";
import { db, transactions, financialAccounts, findByIdForCompany } from "@burnless/db";
import { eq, and } from "drizzle-orm";
import { requireCompanyWrite, parseBody, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { trackDataMutation } from "@/lib/data-mutation-tracker";
import { getActiveScenario } from "@/lib/scenario-middleware";
import { updateTransactionSchema } from "../schemas";

/**
 * Manual-CRUD on a single transaction. Transactions are actuals (spec §0.1/§0.2):
 *   - Only source='manual' rows are editable/deletable (403 otherwise).
 *   - A non-base scenario active ⇒ refuse (409) — actuals are never scenario-overlaid.
 *   - PATCH may change the account (transactions are flat actuals, unlike forecast
 *     lines whose account is locked); a changed accountId re-runs the AUTHZ-02
 *     ownership check.
 * No cache tag to invalidate: the transactions ledger is uncached (compute-dashboard
 * reads it via request-scoped React.cache; router.refresh() re-reads fresh).
 * trackDataMutation still fires so the insight badge/countdown restales — mirrors POST.
 */

export const PATCH = withErrorHandler(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const ctx = await requireCompanyWrite();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;

  const row = await findByIdForCompany(transactions, id, ctx.companyId);
  if (!row) return errorResponse("Transaction not found", 404);
  if (row.source !== "manual") {
    return errorResponse("Only manually-entered transactions can be edited.", 403);
  }
  if (getActiveScenario(request)) {
    return errorResponse("Transactions are actuals — switch to base view to edit.", 409);
  }

  const parsed = await parseBody(request, updateTransactionSchema);
  if ("error" in parsed) return parsed.error;
  const data = parsed.data;

  // AUTHZ-02: a changed accountId must still belong to the caller's company.
  if (data.accountId && data.accountId !== row.accountId) {
    const accCheck = await db
      .select({ id: financialAccounts.id })
      .from(financialAccounts)
      .where(and(eq(financialAccounts.companyId, ctx.companyId), eq(financialAccounts.id, data.accountId)));
    if (accCheck.length === 0) {
      return errorResponse("accountId does not belong to your company", 403);
    }
  }

  const values: Record<string, unknown> = { ...data };
  if (data.amount !== undefined) values.amount = String(data.amount);

  const [updated] = await db
    .update(transactions)
    .set(values)
    .where(and(eq(transactions.id, id), eq(transactions.companyId, ctx.companyId)))
    .returning();
  if (!updated) return errorResponse("Transaction not found", 404);

  await logAudit(ctx, "transaction", id, "update", { after: updated });
  await trackDataMutation(ctx.companyId, "expenses");
  return NextResponse.json(updated);
});

export const DELETE = withErrorHandler(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const ctx = await requireCompanyWrite();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;

  const row = await findByIdForCompany(transactions, id, ctx.companyId);
  if (!row) return errorResponse("Transaction not found", 404);
  if (row.source !== "manual") {
    return errorResponse("Only manually-entered transactions can be deleted.", 403);
  }
  if (getActiveScenario(request)) {
    return errorResponse("Transactions are actuals — switch to base view to delete.", 409);
  }

  await db
    .delete(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.companyId, ctx.companyId)));

  await logAudit(ctx, "transaction", id, "delete", {});
  await trackDataMutation(ctx.companyId, "expenses");
  return NextResponse.json({ deleted: true });
});
