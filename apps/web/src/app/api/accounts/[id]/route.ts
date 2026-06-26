import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db, transactions, financialAccounts, findByIdForCompany, scenarioUpdate, scenarioDelete } from "@burnless/db";
import { eq, and, sql } from "drizzle-orm";
import { updateAccountSchema } from "@burnless/types";
import { requireCompanyAccess, requireRole, parseBody, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { trackDataMutation } from "@/lib/data-mutation-tracker";
import { getActiveScenario } from "@/lib/scenario-middleware";

export const GET = withErrorHandler(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;

  const row = await findByIdForCompany(financialAccounts, id, ctx.companyId);
  if (!row) return errorResponse("Account not found", 404);
  return NextResponse.json(row);
});

export const PATCH = withErrorHandler(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;
  const { id } = await params;

  const scenarioId = getActiveScenario(request);

  const parsed = await parseBody(request, updateAccountSchema);
  if ("error" in parsed) return parsed.error;

  const row = await scenarioUpdate("financial_account", financialAccounts, id, parsed.data, scenarioId, ctx.companyId);
  if (!row) return errorResponse("Account not found", 404);
  await logAudit(ctx, "financial_account", id, "update", { after: row });
  await trackDataMutation(ctx.companyId, "accounts");
  revalidateTag("accounts", { expire: 0 });
  return NextResponse.json(row);
});

export const DELETE = withErrorHandler(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "admin");
  if (roleErr) return roleErr;
  const { id } = await params;

  // Guard hard (§0.3). The transactions.accountId FK is CASCADE, so deleting a
  // non-empty account would silently delete its transactions. Refuse before any
  // delete side-effect; the user reassigns transactions (B1) to empty it first.
  const account = await findByIdForCompany(financialAccounts, id, ctx.companyId);
  if (!account) return errorResponse("Account not found", 404);
  if (account.isSystem) {
    return errorResponse("System accounts can't be deleted.", 403);
  }
  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(transactions)
    .where(and(eq(transactions.companyId, ctx.companyId), eq(transactions.accountId, id)));
  const count = countRows[0]?.count ?? 0;
  if (count > 0) {
    return errorResponse(
      `This account has ${count} transaction${count === 1 ? "" : "s"}. Reassign or remove them before deleting the account.`,
      409,
    );
  }

  const scenarioId = getActiveScenario(request);

  const ok = await scenarioDelete("financial_account", financialAccounts, id, scenarioId, ctx.companyId);
  if (!ok) return errorResponse("Account not found", 404);
  await logAudit(ctx, "financial_account", id, "delete", {});
  await trackDataMutation(ctx.companyId, "accounts");
  revalidateTag("accounts", { expire: 0 });
  return NextResponse.json({ deleted: true });
});
