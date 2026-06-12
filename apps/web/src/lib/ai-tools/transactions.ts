/**
 * Actuals toolset (S3a Plan 3): list_accounts (read — resolve account name→id,
 * since accounts aren't in the AI context snapshot) + record_transaction (write
 * — upsert an actual on an account, keyed on externalId). record_transaction
 * writes the BASE transactions table (actuals are not scenario-overlaid).
 */
import { z } from "zod";
import { db, financialAccounts } from "@burnless/db";
import { eq } from "drizzle-orm";
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

export const transactionSchemas: Record<string, z.ZodType> = {
  list_accounts: z.object({}),
};

export const transactionHandlers: Record<string, ToolHandler> = {
  list_accounts: listAccounts,
};
