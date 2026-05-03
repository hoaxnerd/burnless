import { describe, it, expect } from "vitest";
import {
  computeRevenueStream,
  computeTotalRevenue,
  computeSubscriptionDetail,
  type RevenueStreamInput,
  type SubscriptionParams,
} from "../revenue";

describe("revenue — edge cases", () => {
  const start = new Date(2026, 0, 1);
  const end = new Date(2026, 5, 1);

  describe("subscription with high churn (revenue decline)", () => {
    it("customers decrease when churn > new customers", () => {
      const params: SubscriptionParams = {
        startingCustomers: 100,
        monthlyPrice: 50,
        newCustomersPerMonth: 2,
        monthlyChurnRate: 0.10, // 10% churn = ~10 lost, only 2 gained
      };
      const details = computeSubscriptionDetail(params, start, end);

      // Month 1: churn 10, add 2 → 92 customers
      expect(details[0]!.customers).toBe(92);
      // Month 2: churn ~9.2, add 2 → ~84.8
      expect(details[1]!.customers).toBeLessThan(92);
      // Customers should decline over time
      expect(details[5]!.customers).toBeLessThan(details[0]!.customers);
    });
  });

  describe("subscription with zero starting customers", () => {
    it("grows from zero with new customers only", () => {
      const params: SubscriptionParams = {
        startingCustomers: 0,
        monthlyPrice: 100,
        newCustomersPerMonth: 10,
        monthlyChurnRate: 0.05,
      };
      const details = computeSubscriptionDetail(params, start, end);

      // Month 1: churn 0 (0 * 0.05), add 10 → 10 customers
      expect(details[0]!.customers).toBe(10);
      expect(details[0]!.churnedCustomers).toBe(0);
      expect(details[0]!.newCustomers).toBe(10);
    });
  });

  describe("subscription with zero price", () => {
    it("produces zero MRR despite customers", () => {
      const params: SubscriptionParams = {
        startingCustomers: 100,
        monthlyPrice: 0,
        newCustomersPerMonth: 10,
        monthlyChurnRate: 0.05,
      };
      const details = computeSubscriptionDetail(params, start, end);
      expect(details[0]!.mrr).toBe(0);
      expect(details[0]!.newMrr).toBe(0);
    });
  });

  describe("subscription with expansion rate", () => {
    it("adds expansion MRR on existing revenue", () => {
      const params: SubscriptionParams = {
        startingCustomers: 100,
        monthlyPrice: 50,
        newCustomersPerMonth: 0,
        monthlyChurnRate: 0,
        expansionRate: 0.05, // 5% expansion
      };
      const details = computeSubscriptionDetail(params, start, end);

      // Existing MRR = 100 * 50 = 5000, expansion = 5000 * 0.05 = 250
      expect(details[0]!.expansionMrr).toBe(250);
      expect(details[0]!.mrr).toBe(5250); // existing + expansion
    });
  });

  describe("subscription with price growth", () => {
    it("increases price monthly", () => {
      const params: SubscriptionParams = {
        startingCustomers: 10,
        monthlyPrice: 100,
        newCustomersPerMonth: 0,
        monthlyChurnRate: 0,
        priceGrowthRate: 0.10, // 10% monthly price increase
      };
      const details = computeSubscriptionDetail(params, start, end);

      // Month 1: 10 * 100 = 1000
      expect(details[0]!.mrr).toBe(1000);
      // Month 2: price = 110, mrr = 10 * 110 = 1100
      expect(details[1]!.mrr).toBe(1100);
    });
  });

  describe("one_time with zero units", () => {
    it("produces zero revenue", () => {
      const stream: RevenueStreamInput = {
        id: "s1",
        name: "Product Sales",
        type: "one_time",
        parameters: { unitsPerMonth: 0, pricePerUnit: 100 },
        startDate: start,
        endDate: null,
      };
      const result = computeRevenueStream(stream, start, end);
      for (const [, val] of result) {
        expect(val).toBe(0);
      }
    });
  });

  describe("usage_based with zero users", () => {
    it("produces zero revenue", () => {
      const stream: RevenueStreamInput = {
        id: "s1",
        name: "API Usage",
        type: "usage_based",
        parameters: { activeUsers: 0, avgUsagePerUser: 100, pricePerUnit: 0.01 },
        startDate: start,
        endDate: null,
      };
      const result = computeRevenueStream(stream, start, end);
      for (const [, val] of result) {
        expect(val).toBe(0);
      }
    });
  });

  describe("services with zero hours", () => {
    it("produces zero revenue", () => {
      const stream: RevenueStreamInput = {
        id: "s1",
        name: "Consulting",
        type: "services",
        parameters: { hoursPerMonth: 0, hourlyRate: 200 },
        startDate: start,
        endDate: null,
      };
      const result = computeRevenueStream(stream, start, end);
      for (const [, val] of result) {
        expect(val).toBe(0);
      }
    });
  });

  describe("computeTotalRevenue with empty streams", () => {
    it("returns empty series", () => {
      const result = computeTotalRevenue([], start, end);
      expect(result.size).toBe(0);
    });
  });

  describe("computeTotalRevenue with multiple streams", () => {
    it("sums across all stream types", () => {
      const streams: RevenueStreamInput[] = [
        {
          id: "s1",
          name: "SaaS",
          type: "subscription",
          parameters: {
            startingCustomers: 10,
            monthlyPrice: 100,
            newCustomersPerMonth: 0,
            monthlyChurnRate: 0,
          },
          startDate: start,
          endDate: null,
        },
        {
          id: "s2",
          name: "Products",
          type: "one_time",
          parameters: { unitsPerMonth: 5, pricePerUnit: 200 },
          startDate: start,
          endDate: null,
        },
      ];
      const result = computeTotalRevenue(streams, start, end);
      // SaaS: 10 * 100 = 1000, One-time: 5 * 200 = 1000 → total = 2000
      expect(result.get("2026-01")).toBe(2000);
    });
  });

  describe("services with rate increase", () => {
    it("increases rate over time", () => {
      const stream: RevenueStreamInput = {
        id: "s1",
        name: "Consulting",
        type: "services",
        parameters: {
          hoursPerMonth: 100,
          hourlyRate: 100,
          rateIncreaseRate: 0.12, // 12% annual → 1% monthly
        },
        startDate: start,
        endDate: null,
      };
      const result = computeRevenueStream(stream, start, end);
      const jan = result.get("2026-01")!;
      const feb = result.get("2026-02")!;
      expect(feb).toBeGreaterThan(jan);
    });
  });
});
