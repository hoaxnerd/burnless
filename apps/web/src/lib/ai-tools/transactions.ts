/**
 * Actuals toolset (S3a Plan 3): list_accounts (read — resolve account name→id,
 * since accounts aren't in the AI context snapshot) + record_transaction (write
 * — upsert an actual on an account, keyed on externalId). record_transaction
 * writes the BASE transactions table (actuals are not scenario-overlaid).
 */
import { z } from "zod";
import { db, financialAccounts, transactions } from "@burnless/db";
import { and, eq } from "drizzle-orm";
import { monetaryAmount } from "@/lib/financial-validation";
import { trackDataMutation } from "@/lib/data-mutation-tracker";
import type { ToolContext, ToolHandler } from "./types";
import { requireCompanyId } from "./types";

// ── list_accounts (read) ─────────────────────────────────────────────────────
async function listAccounts(_input: Record<string, unknown>, context: ToolContext): Promise<string> {
  const ctx = requireCompanyId(context);
  const rows = await db
    .select({
      id: financialAccounts.id,
      name: financialAccounts.name,
      type: financialAccounts.type,
      category: financialAccounts.category,
      coversHeadcount: financialAccounts.coversHeadcount,
    })
    .from(financialAccounts)
    .where(eq(financialAccounts.companyId, ctx.companyId));
  return JSON.stringify({ accounts: rows });
}

// ── record_transaction (write) ───────────────────────────────────────────────
const recordTransactionSchema = z.object({
  accountId: z.string().min(1).max(100),
  date: z.string().transform((s) => new Date(s)),
  amount: monetaryAmount(),
  description: z.string().max(2000).nullable().optional(),
  vendor: z.string().max(200).nullable().optional(),
  externalId: z.string().max(255).nullable().optional(),
});

function isExpenseCategory(category: string): boolean {
  return category === "cogs" || category === "operating_expense" || category === "other_expense";
}

async function recordTransaction(input: Record<string, unknown>, context: ToolContext): Promise<string> {
  const ctx = requireCompanyId(context);
  const data = recordTransactionSchema.parse(input);

  // AUTHZ (mirror api/transactions AUTHZ-02): account must belong to the company.
  const [acc] = await db
    .select({ id: financialAccounts.id, name: financialAccounts.name, category: financialAccounts.category })
    .from(financialAccounts)
    .where(and(eq(financialAccounts.companyId, ctx.companyId), eq(financialAccounts.id, data.accountId)));
  if (!acc) return JSON.stringify({ error: "accountId does not belong to your company" });

  const [row] = await db
    .insert(transactions)
    .values({
      companyId: ctx.companyId,
      accountId: data.accountId,
      date: data.date,
      amount: String(data.amount),
      description: data.description ?? null,
      vendor: data.vendor ?? null,
      source: "integration",
      externalId: data.externalId ?? null,
    })
    .returning();

  // Mirror the api/transactions route: no cache tag (transactions are uncached;
  // dashboard recomputes via request-scoped React.cache), but restale insights.
  await trackDataMutation(ctx.companyId, isExpenseCategory(acc.category) ? "expenses" : "revenue");

  return JSON.stringify({ action: "created", id: row!.id, account: acc.name, amount: row!.amount });
}

export const transactionSchemas: Record<string, z.ZodType> = {
  list_accounts: z.object({}),
  record_transaction: recordTransactionSchema,
};

export const transactionHandlers: Record<string, ToolHandler> = {
  list_accounts: listAccounts,
  record_transaction: recordTransaction,
};
