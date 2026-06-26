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
  date: z.string().date(),
  amount: monetaryAmount(),
  description: z.string().max(2000).nullable().optional(),
  vendor: z.string().max(200).nullable().optional(),
  externalId: z.string().max(255).nullable().optional(),
});

function isExpenseCategory(category: string): boolean {
  return category === "cogs" || category === "operating_expense" || category === "other_expense";
}

async function recordTransaction(input: Record<string, unknown>, context: ToolContext): Promise<string> {
  // §3: transactions are actuals — they always write the BASE ledger and are never
  // scenario-overlaid. If a scenario is active, refuse rather than silently writing
  // base (which would confuse the user). Precedent: handler-level scenario guards
  // (scenario-mutate.ts requireScenario). Stays mutates:"write", nonFacade:true.
  if (context.scenarioId) {
    return JSON.stringify({ error: "Transactions are actuals and can't be recorded while a scenario is active. Switch to base view." });
  }
  const ctx = requireCompanyId(context);
  const data = recordTransactionSchema.parse(input);

  // AUTHZ (mirror api/transactions AUTHZ-02): account must belong to the company.
  const [acc] = await db
    .select({ id: financialAccounts.id, name: financialAccounts.name, category: financialAccounts.category })
    .from(financialAccounts)
    .where(and(eq(financialAccounts.companyId, ctx.companyId), eq(financialAccounts.id, data.accountId)));
  if (!acc) return JSON.stringify({ error: "accountId does not belong to your company" });

  const values = {
    companyId: ctx.companyId,
    accountId: data.accountId,
    date: new Date(data.date),
    amount: String(data.amount),
    description: data.description ?? null,
    vendor: data.vendor ?? null,
    source: "integration" as const,
    externalId: data.externalId ?? null,
  };

  let row: typeof transactions.$inferSelect | undefined;
  let action: "created" | "updated" = "created";

  if (data.externalId) {
    // Pre-check for an accurate created/updated label; the unique (companyId,
    // externalId) index makes the upsert itself atomic regardless.
    const [existing] = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(and(eq(transactions.companyId, ctx.companyId), eq(transactions.externalId, data.externalId)));
    action = existing ? "updated" : "created";
    [row] = await db
      .insert(transactions)
      .values(values)
      .onConflictDoUpdate({
        target: [transactions.companyId, transactions.externalId],
        set: {
          accountId: values.accountId,
          date: values.date,
          amount: values.amount,
          description: values.description,
          vendor: values.vendor,
        },
      })
      .returning();
  } else {
    [row] = await db.insert(transactions).values(values).returning();
  }

  // Mirror the api/transactions route: no cache tag (transactions are uncached;
  // dashboard recomputes via request-scoped React.cache), but restale insights.
  await trackDataMutation(ctx.companyId, isExpenseCategory(acc.category) ? "expenses" : "revenue");

  return JSON.stringify({ action, id: row!.id, account: acc.name, amount: row!.amount });
}

export const transactionSchemas: Record<string, z.ZodType> = {
  list_accounts: z.object({}),
  record_transaction: recordTransactionSchema,
};

export const transactionHandlers: Record<string, ToolHandler> = {
  list_accounts: listAccounts,
  record_transaction: recordTransaction,
};
