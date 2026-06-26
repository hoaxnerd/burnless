import { describe, it, expect } from "vitest";
import type Stripe from "stripe";
import { mapBalanceTransaction } from "../map";
import type { MappedRecord } from "../../contracts";

/** Build a minimal balance_transaction-shaped fixture. Only the fields the mapper
 *  reads are populated; cast through `unknown` to satisfy the full Stripe type. */
function bt(partial: Partial<Stripe.BalanceTransaction> & { reporting_category: string }): Stripe.BalanceTransaction {
  return {
    id: "txn_x",
    object: "balance_transaction",
    amount: 0,
    fee: 0,
    net: 0,
    currency: "usd",
    created: 1_700_000_000, // 2023-11-14T22:13:20Z
    description: null,
    source: null,
    type: "charge",
    exchange_rate: null,
    fee_details: [],
    ...partial,
  } as unknown as Stripe.BalanceTransaction;
}

describe("mapBalanceTransaction", () => {
  it("charge with a fee → TWO records (gross revenue + fee expense)", () => {
    const out = mapBalanceTransaction(
      bt({ id: "txn_x", reporting_category: "charge", amount: 10000, fee: 320, net: 9680, currency: "usd" }),
    );
    expect(out).toHaveLength(2);

    const rev = out[0]!;
    const fee = out[1]!;
    // (a) gross revenue
    expect(rev.externalId).toBe("stripe:txn_x");
    expect(rev.amount).toBe(100.0);
    expect(rev.currency).toBe("usd");
    expect(rev.categoryHint).toBe("revenue");
    expect(rev.date).toEqual(new Date(1_700_000_000 * 1000));
    // (b) fee expense — NEGATIVE
    expect(fee.externalId).toBe("stripe:txn_x:fee");
    expect(fee.amount).toBe(-3.2);
    expect(fee.categoryHint).toBe("payment_processing_fees");
  });

  it("treats reporting_category:'payment' the same as 'charge'", () => {
    const out = mapBalanceTransaction(
      bt({ id: "txn_p", reporting_category: "payment", amount: 5000, fee: 175, net: 4825 }),
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ externalId: "stripe:txn_p", amount: 50.0, categoryHint: "revenue" });
    expect(out[1]).toMatchObject({ externalId: "stripe:txn_p:fee", amount: -1.75, categoryHint: "payment_processing_fees" });
  });

  it("charge with fee:0 → ONE record (no fee row)", () => {
    const out = mapBalanceTransaction(
      bt({ id: "txn_nofee", reporting_category: "charge", amount: 2500, fee: 0, net: 2500 }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ externalId: "stripe:txn_nofee", amount: 25.0, categoryHint: "revenue" });
  });

  it("refund → one record from net (negative), categoryHint refund", () => {
    const out = mapBalanceTransaction(
      bt({ id: "txn_r", reporting_category: "refund", amount: -5000, fee: 0, net: -5000 }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ externalId: "stripe:txn_r", amount: -50.0, categoryHint: "refund" });
  });

  it("dispute → one record from net (negative), categoryHint dispute", () => {
    const out = mapBalanceTransaction(
      bt({ id: "txn_d", reporting_category: "dispute", amount: -15000, fee: 0, net: -15000 }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ externalId: "stripe:txn_d", amount: -150.0, categoryHint: "dispute" });
  });

  it("dispute_reversal → one record from net (positive recovery), categoryHint dispute", () => {
    const out = mapBalanceTransaction(
      bt({ id: "txn_dr", reporting_category: "dispute_reversal", amount: 15000, fee: 0, net: 15000 }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ externalId: "stripe:txn_dr", amount: 150.0, categoryHint: "dispute" });
  });

  it("standalone fee → one record from net (negative), categoryHint payment_processing_fees", () => {
    const out = mapBalanceTransaction(
      bt({ id: "txn_f", reporting_category: "fee", amount: -1200, fee: 0, net: -1200 }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ externalId: "stripe:txn_f", amount: -12.0, categoryHint: "payment_processing_fees" });
  });

  it.each([
    "payout",
    "payout_reversal",
    "transfer",
    "transfer_reversal",
    "connect_reserved_funds",
    "risk_reserved_funds",
    "topup",
  ])("excludes balance-movement category %s → []", (category) => {
    const out = mapBalanceTransaction(
      bt({ id: "txn_excl", reporting_category: category, amount: 100000, fee: 0, net: 100000 }),
    );
    expect(out).toEqual([]);
  });

  it("unknown reporting_category → [] (skipped safely)", () => {
    const out = mapBalanceTransaction(
      bt({ id: "txn_u", reporting_category: "some_future_category", amount: 100, net: 100 }),
    );
    expect(out).toEqual([]);
  });

  it("zero-decimal currency (jpy) → no division", () => {
    const out = mapBalanceTransaction(
      bt({ id: "txn_jpy", reporting_category: "charge", amount: 1000, fee: 0, net: 1000, currency: "jpy" }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ externalId: "stripe:txn_jpy", amount: 1000, currency: "jpy", categoryHint: "revenue" });
  });

  it("zero-decimal currency applies to the fee split too (krw)", () => {
    const out = mapBalanceTransaction(
      bt({ id: "txn_krw", reporting_category: "charge", amount: 10000, fee: 300, net: 9700, currency: "krw" }),
    );
    expect(out).toHaveLength(2);
    expect(out[0]!.amount).toBe(10000);
    expect(out[1]!.amount).toBe(-300);
  });

  it("description prefers expanded source.description, then txn.description, then category", () => {
    const withSource = mapBalanceTransaction(
      bt({ id: "txn_s1", reporting_category: "charge", amount: 1000, net: 1000, source: { description: "Pro plan" } as unknown as Stripe.BalanceTransaction["source"] }),
    );
    expect(withSource[0]!.description).toBe("Pro plan");

    const withTxnDesc = mapBalanceTransaction(
      bt({ id: "txn_s2", reporting_category: "charge", amount: 1000, net: 1000, description: "Subscription update" }),
    );
    expect(withTxnDesc[0]!.description).toBe("Subscription update");

    const fallback = mapBalanceTransaction(
      bt({ id: "txn_s3", reporting_category: "dispute", amount: -1000, net: -1000 }),
    );
    expect(fallback[0]!.description).toBe("dispute");
  });

  it("stashes raw stripe facts in metadata", () => {
    const out = mapBalanceTransaction(
      bt({
        id: "txn_m",
        reporting_category: "charge",
        amount: 1000,
        fee: 30,
        net: 970,
        type: "charge",
        exchange_rate: 1.07,
        fee_details: [{ amount: 30, currency: "usd", type: "stripe_fee", application: null, description: "Stripe processing fees" }],
      }),
    );
    for (const rec of out as MappedRecord[]) {
      expect(rec.metadata).toMatchObject({
        reportingCategory: "charge",
        stripeType: "charge",
        exchangeRate: 1.07,
      });
      expect((rec.metadata as { feeDetails: unknown }).feeDetails).toHaveLength(1);
    }
  });

  it("date converts unix seconds → JS Date", () => {
    const out = mapBalanceTransaction(
      bt({ id: "txn_date", reporting_category: "refund", amount: -100, net: -100, created: 1_650_000_000 }),
    );
    expect(out[0]!.date).toEqual(new Date(1_650_000_000 * 1000));
  });
});
