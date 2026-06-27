import { describe, it, expect, vi } from "vitest";
import type Stripe from "stripe";

// Mock the lazy SDK factory so no network happens.
vi.mock("../client", () => ({
  STRIPE_API_VERSION: "2026-06-24.dahlia",
  getStripe: vi.fn(),
}));
import { getStripe } from "../client";
import { stripeConnector } from "../connector";
import type { MappedRecord, SyncCursor } from "../../contracts";

// ── Fixtures: a charge with a fee (→ 2 records) and a payout (→ 0 records) ──
const chargeTxn = {
  id: "txn_charge1",
  reporting_category: "charge",
  type: "charge",
  currency: "usd",
  created: 1_700_000_000,
  amount: 10_000, // $100.00
  fee: 320, // $3.20
  net: 9_680,
  description: "Acme subscription",
  source: { description: "Acme subscription" },
  fee_details: [],
  exchange_rate: null,
} as unknown as Stripe.BalanceTransaction;

const payoutTxn = {
  id: "txn_payout1",
  reporting_category: "payout",
  type: "payout",
  currency: "usd",
  created: 1_700_000_100,
  amount: -9_680,
  fee: 0,
  net: -9_680,
  description: "Payout to bank",
  source: null,
  fee_details: [],
  exchange_rate: null,
} as unknown as Stripe.BalanceTransaction;

/** A `.list()`-style async iterable over the given fixtures. */
function asyncIterable<T>(items: T[]): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) yield item;
    },
  };
}

async function collect(it: AsyncIterable<MappedRecord>): Promise<MappedRecord[]> {
  const out: MappedRecord[] = [];
  for await (const r of it) out.push(r);
  return out;
}

const ctx = { companyId: "co_1", apiKey: "rk_test_abc" };

describe("stripeConnector.source.backfill", () => {
  it("yields mapped records for all fixture txns (charge→2, payout→0)", async () => {
    let captured: Record<string, unknown> = {};
    const list = vi.fn((params: Record<string, unknown>) => {
      captured = params;
      return asyncIterable([chargeTxn, payoutTxn]);
    });
    (getStripe as any).mockResolvedValue({ balanceTransactions: { list } });

    const records = await collect(stripeConnector.source!.backfill(ctx));

    // charge → gross + fee = 2; payout → 0  ⇒  2 total
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ externalId: "stripe:txn_charge1", categoryHint: "revenue" });
    expect(records[1]).toMatchObject({ externalId: "stripe:txn_charge1:fee", categoryHint: "payment_processing_fees" });

    // auto-paginates over balance_transactions, expanding the source + its customer.
    expect(list).toHaveBeenCalledTimes(1);
    expect(captured).toMatchObject({ limit: 100, expand: ["data.source", "data.source.customer"] });
    expect(captured).not.toHaveProperty("created");
  });
});

describe("stripeConnector.source.incremental", () => {
  it("with a cursor passes created:{ gt: cursor.created } to list", async () => {
    let captured: Record<string, unknown> = {};
    const list = vi.fn((params: Record<string, unknown>) => {
      captured = params;
      return asyncIterable([chargeTxn]);
    });
    (getStripe as any).mockResolvedValue({ balanceTransactions: { list } });
    const cursor: SyncCursor = { created: 1_699_999_999 };

    const records = await collect(stripeConnector.source!.incremental(ctx, cursor));

    expect(records).toHaveLength(2); // charge → 2 records
    expect(list).toHaveBeenCalledTimes(1);
    expect(captured).toMatchObject({
      limit: 100,
      expand: ["data.source", "data.source.customer"],
      created: { gt: 1_699_999_999 },
    });
  });

  it("with a null cursor omits created (full incremental)", async () => {
    let captured: Record<string, unknown> = {};
    const list = vi.fn((params: Record<string, unknown>) => {
      captured = params;
      return asyncIterable([chargeTxn]);
    });
    (getStripe as any).mockResolvedValue({ balanceTransactions: { list } });

    const records = await collect(stripeConnector.source!.incremental(ctx, null));

    expect(records).toHaveLength(2);
    expect(list).toHaveBeenCalledTimes(1);
    expect(captured).toMatchObject({ limit: 100, expand: ["data.source", "data.source.customer"] });
    expect(captured).not.toHaveProperty("created");
  });
});
