import { describe, it, expect } from "vitest";
import {
  computeForecastLine,
  computeAllForecastLines,
  aggregateByAccount,
  evaluateSimpleExpression,
  type ForecastLineInput,
} from "../forecasting";
import { monthKey } from "../utils";

describe("forecasting", () => {
  const start = new Date(2026, 0, 1); // Jan 2026
  const end = new Date(2026, 5, 1); // Jun 2026

  describe("fixed method", () => {
    it("produces constant values each month", () => {
      const line: ForecastLineInput = {
        id: "l1",
        accountId: "a1",
        method: "fixed",
        parameters: { amount: 5000 },
        startDate: start,
        endDate: null,
      };
      const result = computeForecastLine(line, start, end);
      expect(result.size).toBe(6);
      for (const [, val] of result) {
        expect(val).toBe(5000);
      }
    });

    it("respects start/end date boundaries", () => {
      const line: ForecastLineInput = {
        id: "l1",
        accountId: "a1",
        method: "fixed",
        parameters: { amount: 1000 },
        startDate: new Date(2026, 1, 15), // mid-Feb
        endDate: new Date(2026, 3, 20), // mid-Apr
      };
      const result = computeForecastLine(line, start, end);
      expect(result.get("2026-01")).toBe(0); // before start
      expect(result.get("2026-02")).toBe(1000); // active
      expect(result.get("2026-03")).toBe(1000); // active
      expect(result.get("2026-04")).toBe(1000); // active
      expect(result.get("2026-05")).toBe(0); // after end
    });
  });

  describe("growth_rate method", () => {
    it("compounds monthly", () => {
      const line: ForecastLineInput = {
        id: "l1",
        accountId: "a1",
        method: "growth_rate",
        parameters: { baseAmount: 10000, monthlyGrowthRate: 0.10 },
        startDate: start,
        endDate: null,
      };
      const result = computeForecastLine(line, start, end);
      expect(result.get("2026-01")).toBe(10000);
      expect(result.get("2026-02")).toBe(11000);
      // Month 3: 10000 * 1.1^2 = 12100
      expect(result.get("2026-03")).toBe(12100);
    });
  });

  describe("per_unit method", () => {
    it("multiplies units by price", () => {
      const line: ForecastLineInput = {
        id: "l1",
        accountId: "a1",
        method: "per_unit",
        parameters: { units: 100, pricePerUnit: 50 },
        startDate: start,
        endDate: null,
      };
      const result = computeForecastLine(line, start, end);
      expect(result.get("2026-01")).toBe(5000);
      expect(result.get("2026-06")).toBe(5000); // no growth
    });

    it("applies unit and price growth rates", () => {
      const line: ForecastLineInput = {
        id: "l1",
        accountId: "a1",
        method: "per_unit",
        parameters: { units: 100, pricePerUnit: 10, unitGrowthRate: 0.05 },
        startDate: start,
        endDate: null,
      };
      const result = computeForecastLine(line, start, end);
      expect(result.get("2026-01")).toBe(1000); // 100 * 10
      expect(result.get("2026-02")).toBe(1050); // 105 * 10
    });
  });

  describe("percentage_of method", () => {
    it("calculates percentage of another line", () => {
      const lines: ForecastLineInput[] = [
        {
          id: "revenue",
          accountId: "a1",
          method: "fixed",
          parameters: { amount: 100000 },
          startDate: start,
          endDate: null,
        },
        {
          id: "cogs",
          accountId: "a2",
          method: "percentage_of",
          parameters: { sourceLineId: "revenue", percentage: 0.30 },
          startDate: start,
          endDate: null,
        },
      ];
      const results = computeAllForecastLines(lines, start, end);
      const cogsValues = results.get("cogs")!;
      expect(cogsValues.get("2026-01")).toBe(30000);
    });
  });

  describe("overrides", () => {
    it("uses override value when present", () => {
      const overrides = new Map([["2026-03", 9999]]);
      const line: ForecastLineInput = {
        id: "l1",
        accountId: "a1",
        method: "fixed",
        parameters: { amount: 5000 },
        startDate: start,
        endDate: null,
        overrides,
      };
      const result = computeForecastLine(line, start, end);
      expect(result.get("2026-02")).toBe(5000);
      expect(result.get("2026-03")).toBe(9999); // overridden
      expect(result.get("2026-04")).toBe(5000);
    });
  });

  describe("aggregateByAccount", () => {
    it("sums multiple lines for the same account", () => {
      const lines: ForecastLineInput[] = [
        { id: "l1", accountId: "a1", method: "fixed", parameters: { amount: 1000 }, startDate: start, endDate: null },
        { id: "l2", accountId: "a1", method: "fixed", parameters: { amount: 2000 }, startDate: start, endDate: null },
        { id: "l3", accountId: "a2", method: "fixed", parameters: { amount: 500 }, startDate: start, endDate: null },
      ];
      const results = computeAllForecastLines(lines, start, end);
      const byAccount = aggregateByAccount(lines, results);

      expect(byAccount.get("a1")!.get("2026-01")).toBe(3000);
      expect(byAccount.get("a2")!.get("2026-01")).toBe(500);
    });
  });

  describe("evaluateSimpleExpression", () => {
    it("evaluates basic math", () => {
      expect(evaluateSimpleExpression("2 + 3")).toBe(5);
      expect(evaluateSimpleExpression("10 * 5 - 2")).toBe(48);
    });

    it("substitutes variables", () => {
      expect(evaluateSimpleExpression("base * (1 + rate)", { base: 1000, rate: 0.1 })).toBe(1100);
    });

    it("returns 0 for invalid expressions", () => {
      expect(evaluateSimpleExpression("alert('xss')")).toBe(0);
      expect(evaluateSimpleExpression("")).toBe(0);
    });
  });
});
