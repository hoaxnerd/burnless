import { db, financialAccounts } from "@burnless/db";
import { getAccounts } from "@/lib/data";
import type { MappedRecord } from "./contracts";

/** The canonical name of the auto-provisioned Stripe fee account. */
const FEES_ACCOUNT_NAME = "Payment processing fees";

type Hint = NonNullable<MappedRecord["categoryHint"]>;

/**
 * Resolve a connector `categoryHint` to a `financialAccounts.id` for `companyId`.
 *
 * - "revenue" / "refund" / "dispute" → the company's revenue account (the first
 *   `type:"income"` && `category:"revenue"` row). Refunds and disputes are contra
 *   entries booked against the same revenue account (their negative amount nets
 *   revenue down) — keeping them on one account keeps the P&L readable.
 * - "payment_processing_fees" → an expense account named "Payment processing
 *   fees". Found case-insensitively among the company's accounts; if absent it is
 *   CREATED once (`type:"expense"`, `category:"operating_expense"`, non-system).
 *   Find-before-create makes it idempotent.
 *
 * Throws if no revenue account exists (the ingestion can't proceed without one).
 */
export async function resolveAccountId(
  companyId: string,
  hint: Hint | undefined
): Promise<string> {
  const accounts = await getAccounts(companyId);

  if (hint === "payment_processing_fees") {
    const existing = accounts.find(
      (a) => a.name.trim().toLowerCase() === FEES_ACCOUNT_NAME.toLowerCase()
    );
    if (existing) return existing.id;

    const [created] = await db
      .insert(financialAccounts)
      .values({
        companyId,
        name: FEES_ACCOUNT_NAME,
        type: "expense",
        category: "operating_expense",
        isSystem: false,
      })
      .returning();
    if (!created) {
      throw new Error(`Failed to create "${FEES_ACCOUNT_NAME}" account for company ${companyId}.`);
    }
    return created.id;
  }

  // revenue / refund / dispute (and any unset hint) → the revenue account.
  const revenue = accounts.find((a) => a.type === "income" && a.category === "revenue");
  if (!revenue) {
    throw new Error(
      `No revenue account (type:"income", category:"revenue") for company ${companyId}; cannot resolve "${hint ?? "revenue"}".`
    );
  }
  return revenue.id;
}
