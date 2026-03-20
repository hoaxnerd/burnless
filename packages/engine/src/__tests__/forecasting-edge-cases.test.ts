import { describe, it, expect } from "vitest";
import {
  computeForecastLine,
  computeAllForecastLines,
  evaluateSimpleExpression,
  type ForecastLineInput,
} from "../forecasting";

describe("forecasting — edge cases", () => {
  const start = new Date(2026, 0, 1);
  const end = new Date(2026, 5, 1);

  describe("growth_rate with negative rate (decline)", () => {
    it("produces decreasing values", () => {
      const line: ForecastLineInput = {
        id: "l1",
        accountId: "a1",
        method: "growth_rate",
        parameters: { baseAmount: 10000, monthlyGrowthRate: -0.1 },
        startDate: start,
        endDate: null,
      };
      const result = computeForecastLine(line, start, end);
      expect(result.get("2026-01")).toBe(10000);
      expect(result.get("2026-02")).toBe(9000); // 10000 * 0.9
      // 10000 * 0.9^2 = 8100
      expect(result.get("2026-03")).toBe(8100);
    });
  });

  describe("growth_rate with zero base", () => {
    it("stays at zero forever", () => {
      const line: ForecastLineInput = {
        id: "l1",
        accountId: "a1",
        method: "growth_rate",
        parameters: { baseAmount: 0, monthlyGrowthRate: 0.5 },
        startDate: start,
        endDate: null,
      };
      const result = computeForecastLine(line, start, end);
      for (const [, val] of result) {
        expect(val).toBe(0);
      }
    });
  });

  describe("per_unit with negative growth (shrinking)", () => {
    it("produces decreasing revenue", () => {
      const line: ForecastLineInput = {
        id: "l1",
        accountId: "a1",
        method: "per_unit",
        parameters: { units: 100, pricePerUnit: 10, unitGrowthRate: -0.1 },
        startDate: start,
        endDate: null,
      };
      const result = computeForecastLine(line, start, end);
      expect(result.get("2026-01")).toBe(1000);
      expect(result.get("2026-02")).toBe(900); // 90 * 10
    });
  });

  describe("percentage_of with missing source line", () => {
    it("returns 0 when source line not found", () => {
      const line: ForecastLineInput = {
        id: "dep",
        accountId: "a2",
        method: "percentage_of",
        parameters: { sourceLineId: "nonexistent", percentage: 0.5 },
        startDate: start,
        endDate: null,
      };
      const resolved = new Map();
      const result = computeForecastLine(line, start, end, resolved);
      for (const [, val] of result) {
        expect(val).toBe(0);
      }
    });
  });

  describe("percentage_of with no resolvedLines", () => {
    it("returns 0 for all months", () => {
      const line: ForecastLineInput = {
        id: "dep",
        accountId: "a2",
        method: "percentage_of",
        parameters: { sourceLineId: "src", percentage: 0.3 },
        startDate: start,
        endDate: null,
      };
      const result = computeForecastLine(line, start, end); // no resolvedLines
      for (const [, val] of result) {
        expect(val).toBe(0);
      }
    });
  });

  describe("chained percentage_of dependencies", () => {
    it("resolves single-level dependency in computeAllForecastLines", () => {
      const lines: ForecastLineInput[] = [
        {
          id: "base",
          accountId: "a1",
          method: "fixed",
          parameters: { amount: 10000 },
          startDate: start,
          endDate: null,
        },
        {
          id: "dep1",
          accountId: "a2",
          method: "percentage_of",
          parameters: { sourceLineId: "base", percentage: 0.5 },
          startDate: start,
          endDate: null,
        },
      ];
      const results = computeAllForecastLines(lines, start, end);
      expect(results.get("dep1")?.get("2026-01")).toBe(5000);
    });
  });

  describe("custom_formula", () => {
    it("handles division by zero gracefully", () => {
      expect(evaluateSimpleExpression("1 / 0")).toBe(0); // Infinity → 0
    });

    it("handles empty expression", () => {
      expect(evaluateSimpleExpression("")).toBe(0);
    });

    it("handles nested parentheses", () => {
      expect(evaluateSimpleExpression("((2 + 3) * (4 - 1))")).toBe(15);
    });

    it("rejects variable injection attempts", () => {
      expect(evaluateSimpleExpression("process.exit()")).toBe(0);
      expect(evaluateSimpleExpression("require('fs')")).toBe(0);
      expect(evaluateSimpleExpression("globalThis")).toBe(0);
    });

    it("substitutes month variable in formula", () => {
      const line: ForecastLineInput = {
        id: "l1",
        accountId: "a1",
        method: "custom_formula",
        parameters: { expression: "base + (month * step)", variables: { base: 1000, step: 100 } },
        startDate: start,
        endDate: null,
      };
      const result = computeForecastLine(line, start, end);
      expect(result.get("2026-01")).toBe(1000); // month=0
      expect(result.get("2026-02")).toBe(1100); // month=1
      expect(result.get("2026-03")).toBe(1200); // month=2
    });
  });

  describe("fixed method with zero amount", () => {
    it("produces zeros", () => {
      const line: ForecastLineInput = {
        id: "l1",
        accountId: "a1",
        method: "fixed",
        parameters: { amount: 0 },
        startDate: start,
        endDate: null,
      };
      const result = computeForecastLine(line, start, end);
      for (const [, val] of result) {
        expect(val).toBe(0);
      }
    });
  });

  describe("fixed method with negative amount", () => {
    it("produces negative values (e.g., refund forecast)", () => {
      const line: ForecastLineInput = {
        id: "l1",
        accountId: "a1",
        method: "fixed",
        parameters: { amount: -500 },
        startDate: start,
        endDate: null,
      };
      const result = computeForecastLine(line, start, end);
      expect(result.get("2026-01")).toBe(-500);
    });
  });

  describe("date boundary edge cases", () => {
    it("single month range (start = end)", () => {
      const sameMonth = new Date(2026, 0, 1);
      const line: ForecastLineInput = {
        id: "l1",
        accountId: "a1",
        method: "fixed",
        parameters: { amount: 5000 },
        startDate: sameMonth,
        endDate: null,
      };
      const result = computeForecastLine(line, sameMonth, sameMonth);
      expect(result.size).toBe(1);
      expect(result.get("2026-01")).toBe(5000);
    });
  });
});
