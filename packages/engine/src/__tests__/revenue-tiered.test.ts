import { describe, it, expect } from "vitest";
import {
  selectTier,
  computeSubscriptionDetail,
  computeRevenueStream,
  type PricingTier,
  type SubscriptionParams,
  type UsageBasedParams,
  type RevenueStreamInput,
} from "../revenue";

// ── Shared tier fixtures ─────────────────────────────────────────────────────

const THREE_TIERS: PricingTier[] = [
  { name: "Starter",    minUnits: 1,   maxUnits: 10,  pricePerUnit: 20 },
  { name: "Pro",        minUnits: 11,  maxUnits: 50,  pricePerUnit: 40 },
  { name: "Enterprise", minUnits: 51,  maxUnits: null, pricePerUnit: 60 },
];

// ── Test 1: selectTier ───────────────────────────────────────────────────────

describe("selectTier", () => {
  it("picks the matching tier across three tiers", () => {
    expect(selectTier(THREE_TIERS, 1)?.name).toBe("Starter");
    expect(selectTier(THREE_TIERS, 10)?.name).toBe("Starter");
    expect(selectTier(THREE_TIERS, 11)?.name).toBe("Pro");
    expect(selectTier(THREE_TIERS, 25)?.name).toBe("Pro");
    expect(selectTier(THREE_TIERS, 50)?.name).toBe("Pro");
    expect(selectTier(THREE_TIERS, 51)?.name).toBe("Enterprise");
    expect(selectTier(THREE_TIERS, 1000)?.name).toBe("Enterprise");
  });

  it("returns null when no tier matches", () => {
    expect(selectTier(THREE_TIERS, 0)).toBeNull();
  });
});

// ── Test 2: per_seat subscription ────────────────────────────────────────────

describe("subscription pricingModel: per_seat", () => {
  it("10 customers × 25 seats picks M tier ($40/seat) = $10,000 MRR at month 1", () => {
    // 25 seats falls in Pro tier (11-50) at $40/seat
    // 10 customers × 25 seats × $40 = $10,000
    const params: SubscriptionParams = {
      startingCustomers: 10,
      monthlyPrice: 0,              // unused for per_seat
      newCustomersPerMonth: 0,
      monthlyChurnRate: 0,
      pricingModel: "per_seat",
      seatsPerCustomer: 25,
      tiers: THREE_TIERS,
    };

    const details = computeSubscriptionDetail(
      params,
      new Date("2026-01-01"),
      new Date("2026-01-01"),
    );

    expect(details).toHaveLength(1);
    const m1 = details[0]!;
    expect(m1.mrr).toBe(10000); // 10 customers × 25 seats × $40
  });
});

// ── Test 3: tiered usage_based ───────────────────────────────────────────────

describe("usage_based pricingModel: tiered", () => {
  it('100 users × 500 usage picks "Paid" tier ($0.10) = $5,000 at month 1', () => {
    // total usage = 100 × 500 = 50,000 → falls in "Paid" tier
    const usageTiers: PricingTier[] = [
      { name: "Free",  minUnits: 0,      maxUnits: 9999,  pricePerUnit: 0.00 },
      { name: "Paid",  minUnits: 10000,  maxUnits: 99999, pricePerUnit: 0.10 },
      { name: "Scale", minUnits: 100000, maxUnits: null,  pricePerUnit: 0.05 },
    ];

    const stream: RevenueStreamInput = {
      id: "u1",
      name: "API Usage",
      type: "usage_based",
      parameters: {
        activeUsers: 100,
        avgUsagePerUser: 500,
        pricePerUnit: 0,        // unused for tiered
        pricingModel: "tiered",
        tiers: usageTiers,
      } satisfies UsageBasedParams,
      startDate: new Date("2026-01-01"),
      endDate: null,
    };

    const series = computeRevenueStream(
      stream,
      new Date("2026-01-01"),
      new Date("2026-01-01"),
    );

    expect(series.get("2026-01")).toBe(5000); // 100 × 500 × 0.10
  });
});
