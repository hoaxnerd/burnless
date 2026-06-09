import { describe, it, expect } from "vitest";
import {
  computeRevenueStream,
  computeTotalRevenue,
  computeSubscriptionDetail,
  computeSubscriptionDetailForStream,
  type RevenueStreamInput,
  type SubscriptionParams,
} from "../revenue";

describe("revenue", () => {
  const start = new Date(2026, 0, 1);
  const end = new Date(2026, 5, 1);

  describe("subscription revenue", () => {
    it("calculates MRR with customer growth and churn", () => {
      const params: SubscriptionParams = {
        startingCustomers: 100,
        monthlyPrice: 50,
        newCustomersPerMonth: 10,
        monthlyChurnRate: 0.05,
      };

      const details = computeSubscriptionDetail(params, start, end);
      expect(details).toHaveLength(6);

      // Month 1: 100 customers, 5 churn, 10 new = 105 end
      const m1 = details[0]!;
      expect(m1.churnedCustomers).toBe(5);
      expect(m1.newCustomers).toBe(10);
      expect(m1.customers).toBe(105); // 100 - 5 + 10

      // MRR = (95 existing + 10 new) * $50
      expect(m1.mrr).toBe(5250); // (95 * 50) + (10 * 50)
    });

    it("applies expansion rate", () => {
      const params: SubscriptionParams = {
        startingCustomers: 100,
        monthlyPrice: 100,
        newCustomersPerMonth: 0,
        monthlyChurnRate: 0,
        expansionRate: 0.02,
      };

      const details = computeSubscriptionDetail(params, start, end);
      const m1 = details[0]!;
      expect(m1.expansionMrr).toBe(200); // 10000 * 0.02
    });

    // Phase 6 6.2 §1 — per-stream netNewMrr is the canonical explicit 5-term
    // formula New + Expansion + Reactivation − Churned − Contraction. On real
    // subscription data contraction/reactivation are never produced (they stay
    // undefined as named zero Decimals), so making the formula explicitly
    // 5-term is provably a no-op on every month of a realistic stream.
    //
    // This is a LOCK test: the canonical netNewMrr values below are computed
    // from the full-precision Decimal pipeline (rounded once at the boundary),
    // NOT reverse-engineered from already-rounded component fields. The 5-term
    // refactor must leave every one of these byte-identical, and must NOT
    // populate contractionMrr/reactivationMrr (they remain undefined → preserves
    // indexSubscriptionDetails semantics).
    it("computes netNewMrr as explicit 5-term — no behavior change on real data (lock)", () => {
      const params: SubscriptionParams = {
        startingCustomers: 100,
        monthlyPrice: 50,
        newCustomersPerMonth: 10,
        monthlyChurnRate: 0.05,
        expansionRate: 0.03,
      };

      const details = computeSubscriptionDetail(params, start, end);
      expect(details).toHaveLength(6);

      // Canonical full-precision netNewMrr per month (snapshot of the Decimal
      // pipeline). 5-term == 3-term here because contraction = reactivation = 0.
      const canon = [392.5, 397.63, 403.09, 408.86, 414.96, 421.38];
      for (let i = 0; i < details.length; i++) {
        const d = details[i]!;
        expect(d.netNewMrr).toBe(canon[i]);
        // Zero components are NOT emitted onto the detail object.
        expect(d.contractionMrr).toBeUndefined();
        expect(d.reactivationMrr).toBeUndefined();
      }
    });
  });

  describe("one-time revenue", () => {
    it("calculates units * price", () => {
      const stream: RevenueStreamInput = {
        id: "s1",
        name: "Widget Sales",
        type: "one_time",
        parameters: { unitsPerMonth: 50, pricePerUnit: 100 },
        startDate: start,
        endDate: null,
      };
      const result = computeRevenueStream(stream, start, end);
      expect(result.get("2026-01")).toBe(5000);
      expect(result.get("2026-06")).toBe(5000);
    });

    it("applies unit growth", () => {
      const stream: RevenueStreamInput = {
        id: "s1",
        name: "Widget Sales",
        type: "one_time",
        parameters: { unitsPerMonth: 100, pricePerUnit: 10, unitGrowthRate: 0.10 },
        startDate: start,
        endDate: null,
      };
      const result = computeRevenueStream(stream, start, end);
      expect(result.get("2026-01")).toBe(1000);
      expect(result.get("2026-02")).toBe(1100); // 110 * 10
    });
  });

  describe("usage-based revenue", () => {
    it("calculates users * usage * price", () => {
      const stream: RevenueStreamInput = {
        id: "s1",
        name: "API Calls",
        type: "usage_based",
        parameters: { activeUsers: 1000, avgUsagePerUser: 100, pricePerUnit: 0.01 },
        startDate: start,
        endDate: null,
      };
      const result = computeRevenueStream(stream, start, end);
      expect(result.get("2026-01")).toBe(1000); // 1000 * 100 * 0.01
    });
  });

  describe("services revenue", () => {
    it("calculates hours * rate", () => {
      const stream: RevenueStreamInput = {
        id: "s1",
        name: "Consulting",
        type: "services",
        parameters: { hoursPerMonth: 160, hourlyRate: 200 },
        startDate: start,
        endDate: null,
      };
      const result = computeRevenueStream(stream, start, end);
      expect(result.get("2026-01")).toBe(32000);
    });
  });

  describe("computeTotalRevenue", () => {
    it("sums multiple streams", () => {
      const streams: RevenueStreamInput[] = [
        { id: "s1", name: "SaaS", type: "subscription", parameters: { startingCustomers: 100, monthlyPrice: 100, newCustomersPerMonth: 0, monthlyChurnRate: 0 }, startDate: start, endDate: null },
        { id: "s2", name: "Services", type: "services", parameters: { hoursPerMonth: 10, hourlyRate: 100 }, startDate: start, endDate: null },
      ];
      const total = computeTotalRevenue(streams, start, end);
      expect(total.get("2026-01")).toBe(11000); // 10000 + 1000
    });
  });

  // Phase 6 6.3 §1 — proration must carry ALL 5 MRR component fields, not just
  // the original 4 (new/expansion/churned/netNew). The optional contraction /
  // downgrade / reactivation fields must survive the prorated map AND the
  // inactive-month branch so downstream MRR-bridge consumers see a stable shape.
  describe("computeSubscriptionDetailForStream — proration preserves all 5 MRR component fields", () => {
    const PS = new Date(2026, 0, 1);
    const PE = new Date(2026, 11, 1);

    it("prorated active month carries contraction/downgrade/reactivation keys", () => {
      // Mid-month start → proration fraction < 1 (exercises the prorated map).
      const stream: RevenueStreamInput = {
        id: "pro",
        name: "Pro Plan",
        type: "subscription",
        startDate: new Date("2026-03-15"),
        endDate: null,
        parameters: {
          monthlyPrice: 1000,
          startingCustomers: 10,
          newCustomersPerMonth: 2,
          monthlyChurnRate: 0.05,
          expansionRate: 0.02,
        } as never,
      };
      const det = computeSubscriptionDetailForStream(stream, PS, PE);
      const startMonth = det.find((d) => d.month === "2026-03")!;
      expect(startMonth).toBeDefined();
      // The 5-component MRR-bridge shape: every component key is present
      // (value may be undefined for components the subscription model never
      // produces, but the KEY must exist — proration must not drop it).
      expect("contractionMrr" in startMonth).toBe(true);
      expect("downgradeMrr" in startMonth).toBe(true);
      expect("reactivationMrr" in startMonth).toBe(true);
    });

    it("inactive month carries contraction/downgrade/reactivation keys", () => {
      // Future-dated stream → months before start hit the inactive branch.
      const stream: RevenueStreamInput = {
        id: "future",
        name: "Future Plan",
        type: "subscription",
        startDate: new Date("2026-07-01"),
        endDate: null,
        parameters: {
          monthlyPrice: 5000,
          startingCustomers: 0,
          newCustomersPerMonth: 1,
        } as never,
      };
      const det = computeSubscriptionDetailForStream(stream, PS, PE);
      const before = det.find((d) => d.month === "2026-01")!;
      expect(before).toBeDefined();
      expect(before.mrr).toBe(0);
      expect("contractionMrr" in before).toBe(true);
      expect("downgradeMrr" in before).toBe(true);
      expect("reactivationMrr" in before).toBe(true);
    });
  });
});
