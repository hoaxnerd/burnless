import { describe, it, expect } from "vitest";
import {
  computeSubscriptionDetailForStream,
  computeRevenueStream,
  type RevenueStreamInput,
} from "../revenue";

const PS = new Date(2026, 0, 1);
const PE = new Date(2026, 11, 1);

describe("computeSubscriptionDetailForStream — MRR respects stream active window", () => {
  it("a future-dated subscription contributes ZERO MRR before its start month", () => {
    const proPlan: RevenueStreamInput = {
      id: "pro",
      name: "Pro Plan",
      type: "subscription",
      startDate: new Date("2026-07-01"),
      endDate: null,
      parameters: {
        monthlyPrice: 5000,
        pricingModel: "flat_fee",
        startingCustomers: 0,
        newCustomersPerMonth: 1,
      } as never,
    };
    const det = computeSubscriptionDetailForStream(proPlan, PS, PE);
    // Before the July start: no MRR (was leaking ~$30k via raw computeSubscriptionDetail).
    expect(det.find((d) => d.month === "2026-06")?.mrr).toBe(0);
    expect(det.find((d) => d.month === "2026-01")?.mrr).toBe(0);
    // At/after start: MRR is present.
    expect(det.find((d) => d.month === "2026-07")?.mrr ?? 0).toBeGreaterThan(0);
  });

  it("matches computeRevenueStream's subscription series month-for-month (single source of truth)", () => {
    const streams: RevenueStreamInput[] = [
      {
        id: "platform",
        name: "Platform",
        type: "subscription",
        startDate: new Date("2026-05-04"),
        endDate: null,
        parameters: {
          monthlyPrice: 99,
          expansionRate: 0.01,
          monthlyChurnRate: 0.04,
          startingCustomers: 30,
          newCustomersPerMonth: 5,
        } as never,
      },
      {
        id: "pro",
        name: "Pro Plan",
        type: "subscription",
        startDate: new Date("2026-07-01"),
        endDate: null,
        parameters: {
          monthlyPrice: 5000,
          pricingModel: "flat_fee",
          startingCustomers: 0,
          newCustomersPerMonth: 1,
        } as never,
      },
    ];
    for (const s of streams) {
      const det = computeSubscriptionDetailForStream(s, PS, PE);
      const rev = computeRevenueStream(s, PS, PE);
      for (const d of det) {
        expect(d.mrr).toBeCloseTo(rev.get(d.month) ?? 0, 2);
      }
    }
  });
});
