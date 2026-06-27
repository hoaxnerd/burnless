import type Stripe from "stripe";
import type { MappedRecord } from "../contracts";

/** ─────────────────────────────────────────────────────────────────────────
 *  mapBalanceTransaction — the correctness core of the Stripe ingestion.
 *
 *  PURE: no I/O, no DB, no network. One Stripe balance_transaction in →
 *  0, 1, or 2 normalized {@link MappedRecord}s out.
 *
 *  Why classify on `reporting_category` (not `type`): disputes arrive as
 *  `type:"adjustment"` and are only correctly labeled by reporting_category.
 *  Balance-sheet movements (payouts/transfers/reserves/topups) are excluded —
 *  counting them would double-count revenue already booked on the charge.
 *  ──────────────────────────────────────────────────────────────────────── */

/** Currencies Stripe treats as zero-decimal — amounts are already in whole
 *  major units, so we must NOT divide by 100. Source: Stripe zero-decimal list. */
const ZERO_DECIMAL_CURRENCIES = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga",
  "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);

/** Balance-sheet movements — excluded from P&L (return []). */
const EXCLUDED_CATEGORIES = new Set([
  "payout", "payout_reversal",
  "transfer", "transfer_reversal",
  "connect_reserved_funds", "risk_reserved_funds",
  "topup", "topup_reversal",
]);

/** Minor → major units by the currency's exponent. Single division only — no
 *  intermediate float arithmetic — so the integer→major conversion can't drift. */
function toMajor(minor: number, currency: string): number {
  if (ZERO_DECIMAL_CURRENCIES.has(currency)) return minor;
  return minor / 100;
}

/** Counterparty name for a charge-like source (the paying customer). Reads only
 *  fields available on the expanded `source` (the connector expands
 *  `data.source` and `data.source.customer`): the card's billing name, then the
 *  customer's name, then any email. Returns null when none are present. */
function customerVendor(source: Stripe.BalanceTransaction["source"]): string | null {
  const s = source as {
    billing_details?: { name?: string | null } | null;
    customer?: unknown;
    receipt_email?: string | null;
  } | null;
  if (!s) return null;
  const cust =
    s.customer && typeof s.customer === "object"
      ? (s.customer as { name?: string | null; email?: string | null })
      : null;
  return s.billing_details?.name ?? cust?.name ?? s.receipt_email ?? cust?.email ?? null;
}

export function mapBalanceTransaction(txn: Stripe.BalanceTransaction): MappedRecord[] {
  const category = txn.reporting_category;

  if (EXCLUDED_CATEGORIES.has(category)) return [];

  const currency = txn.currency; // settlement currency (already lowercase ISO)
  const date = new Date(txn.created * 1000);
  // Stripe expands `source` when requested; it may carry a richer description.
  const description = (txn.source as { description?: string | null } | null)?.description
    ?? txn.description
    ?? category;
  const metadata: Record<string, unknown> = {
    reportingCategory: txn.reporting_category,
    stripeType: txn.type,
    exchangeRate: txn.exchange_rate,
    feeDetails: txn.fee_details,
  };
  // Counterparty for charge-like rows = the paying customer; processing fees are
  // paid to "Stripe" (set per-record below).
  const vendor = customerVendor(txn.source);

  switch (category) {
    case "charge":
    case "payment": {
      // (a) gross revenue — txn.amount is positive for a charge.
      const records: MappedRecord[] = [
        {
          externalId: `stripe:${txn.id}`,
          date,
          amount: toMajor(txn.amount, currency),
          currency,
          description,
          vendor,
          categoryHint: "revenue",
          metadata,
        },
      ];
      // (b) fee expense — Stripe `fee` is a POSITIVE integer; emit as a negative
      //     major-unit expense. Only when there's actually a fee. Vendor = Stripe
      //     (the fee is money paid to the processor, not the customer).
      if (txn.fee > 0) {
        records.push({
          externalId: `stripe:${txn.id}:fee`,
          date,
          amount: -toMajor(txn.fee, currency),
          currency,
          description,
          vendor: "Stripe",
          categoryHint: "payment_processing_fees",
          metadata,
        });
      }
      return records;
    }

    case "refund": {
      // net is already signed (refund net < 0). Counterparty = the refunded customer.
      return [{ externalId: `stripe:${txn.id}`, date, amount: toMajor(txn.net, currency), currency, description, vendor, categoryHint: "refund", metadata }];
    }

    case "dispute":
    case "dispute_reversal": {
      // dispute net < 0 (loss); dispute_reversal net > 0 (recovery). Both carry
      // the "dispute" hint — sign distinguishes them.
      return [{ externalId: `stripe:${txn.id}`, date, amount: toMajor(txn.net, currency), currency, description, vendor, categoryHint: "dispute", metadata }];
    }

    case "fee": {
      // standalone stripe_fee / stripe_fx_fee — net already signed negative. Paid to Stripe.
      return [{ externalId: `stripe:${txn.id}`, date, amount: toMajor(txn.net, currency), currency, description, vendor: "Stripe", categoryHint: "payment_processing_fees", metadata }];
    }

    default:
      // Unknown category — skip safely.
      return [];
  }
}
