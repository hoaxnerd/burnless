import type Stripe from "stripe";
import type { IntegrationConnector, ValidateResult, MappedRecord, SyncCtx, SyncCursor } from "../contracts";
import { getStripe } from "./client";
import { mapBalanceTransaction } from "./map";

async function validate(creds: Record<string, string>): Promise<ValidateResult> {
  const apiKey = (creds.apiKey ?? "").trim();
  const looksStripe = /^(rk|sk)_(test|live)_/.test(apiKey);
  if (!looksStripe) return { ok: false, error: "That doesn't look like a Stripe API key (expected rk_… or sk_…)." };
  try {
    const stripe = await getStripe(apiKey);
    const bal = await stripe.balance.retrieve(); // GET /v1/balance — zero-arg probe
    return { ok: true, livemode: bal.livemode, meta: { currencies: (bal.available ?? []).map((a) => a.currency) } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: /key/i.test(msg) ? "Stripe rejected that API key. Check it has read access and try again." : "Couldn't reach Stripe with that key." };
  }
}

// Page over balance_transactions, expanding `source` so the mapper can read the
// originating charge/refund description. `.list()` auto-paginates under `for await`
// (every page fetched lazily — never buffered into an array). Each txn yields 0/1/2
// mapped records via the pure mapper.
// Expand `data.source` (the originating charge/refund/dispute — for description)
// and `data.source.customer` (the paying customer — for vendor attribution).
// The customer expand is ignored on sources that have no customer field.
const EXPAND = ["data.source", "data.source.customer"];

async function* backfill(ctx: SyncCtx): AsyncIterable<MappedRecord> {
  const stripe = await getStripe(ctx.apiKey);
  const params: Stripe.BalanceTransactionListParams = { limit: 100, expand: EXPAND };
  for await (const txn of stripe.balanceTransactions.list(params)) yield* mapBalanceTransaction(txn);
}

async function* incremental(ctx: SyncCtx, cursor: SyncCursor): AsyncIterable<MappedRecord> {
  const stripe = await getStripe(ctx.apiKey);
  // `gt` is strictly greater-than the high-water mark (unix seconds) so the
  // last-seen txn isn't re-emitted; a null cursor means a full incremental sweep.
  const params: Stripe.BalanceTransactionListParams = cursor
    ? { limit: 100, expand: EXPAND, created: { gt: cursor.created } }
    : { limit: 100, expand: EXPAND };
  for await (const txn of stripe.balanceTransactions.list(params)) yield* mapBalanceTransaction(txn);
}

export const stripeConnector: IntegrationConnector = {
  id: "stripe",
  displayName: "Stripe",
  description: "Sync revenue, fees, refunds and disputes from your Stripe account.",
  icon: "CreditCard",
  capability: "integrations",
  credentialSpec: {
    fields: [{
      key: "apiKey", label: "Restricted API key", secret: true,
      help: "Create a read-only restricted key with Read on: Charges, Balance transactions, Balance transaction sources, Payouts, Invoices, Subscriptions, Customers.",
    }],
    validate,
  },
  source: { streams: [{ id: "balance_transactions" }], backfill, incremental },
};
