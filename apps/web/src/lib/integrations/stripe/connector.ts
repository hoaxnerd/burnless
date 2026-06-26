import type { IntegrationConnector, ValidateResult, MappedRecord, SyncCtx, SyncCursor } from "../contracts";
import { getStripe } from "./client";

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

// Real generators land in C2.3; placeholders keep C1 shippable (connect works, sync yields nothing).
async function* backfill(_ctx: SyncCtx): AsyncIterable<MappedRecord> { /* C2.3 */ }
async function* incremental(_ctx: SyncCtx, _cursor: SyncCursor): AsyncIterable<MappedRecord> { /* C2.3 */ }

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
