import { describe, it, expect } from "vitest";
import {
  computeRevenueStream,
  computeTotalRevenue,
  computeSubscriptionDetail,
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
});
