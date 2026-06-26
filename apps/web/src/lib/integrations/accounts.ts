import { db, financialAccounts } from "@burnless/db";
import { getAccounts } from "@/lib/data";
import type { MappedRecord } from "./contracts";

/** The canonical name of the auto-provisioned Stripe fee account. */
const FEES_ACCOUNT_NAME = "Payment processing fees";

type Hint = NonNullable<MappedRecord["categoryHint"]>;

/** Resolves a connector `categoryHint` to a `financialAccounts.id`. */
export type AccountResolver = (hint: Hint | undefined) => string;

/**
 * Build a per-run account resolver for `companyId`.
 *
 * Account resolution is done ONCE per `runIntegrationSync` call (NOT per record).
 * This reads `getAccounts` a single time and, if the "Payment processing fees"
 * expense account is absent, CREATES it exactly once — capturing the created id
 * directly rather than re-reading `getAccounts` (which is `unstable_cache`-wrapped
 * and would return a stale list within the run, causing duplicate fee accounts on
 * a multi-fee backfill).
 *
 * Mapping:
 * - "revenue" / "refund" / "dispute" (and any unset hint) → the company's revenue
 *   account (the first `type:"income"` && `category:"revenue"` row). Refunds and
 *   disputes are contra entries booked against the same revenue account.
 * - "payment_processing_fees" → the (possibly just-created) fees expense account.
 *
 * NOTE: resolution is once-per-run. A rare cross-run race (e.g. a concurrent
 * backfill + manual sync, each not yet seeing the other's create) could still
 * produce two fees accounts — acceptable for v1 (both are expense accounts;
 * transaction dedup is unaffected). We intentionally do NOT add a DB unique
 * constraint on (companyId, name): users may legitimately have duplicate names.
 *
 * Throws if no revenue account exists (the ingestion can't proceed without one),
 * deferring the throw to first revenue/refund/dispute resolution.
 */
export async function buildAccountResolver(companyId: string): Promise<AccountResolver> {
  const accounts = await getAccounts(companyId);

  const revenue = accounts.find((a) => a.type === "income" && a.category === "revenue");

  // Find-or-create the fees account ONCE, here (not per record).
  let feesAccountId: string | undefined = accounts.find(
    (a) => a.name.trim().toLowerCase() === FEES_ACCOUNT_NAME.toLowerCase()
  )?.id;
  if (!feesAccountId) {
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
    feesAccountId = created.id; // capture directly — do NOT re-read getAccounts.
  }

  return (hint: Hint | undefined): string => {
    if (hint === "payment_processing_fees") return feesAccountId;
    // revenue / refund / dispute (and any unset hint) → the revenue account.
    if (!revenue) {
      throw new Error(
        `No revenue account (type:"income", category:"revenue") for company ${companyId}; cannot resolve "${hint ?? "revenue"}".`
      );
    }
    return revenue.id;
  };
}
