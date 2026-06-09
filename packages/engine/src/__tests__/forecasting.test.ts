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

  describe("custom_formula cross-line references by name (Phase 4 §4.3)", () => {
    it("resolves a reference to another line by name (zzz fixed 100 → aaa = zzz*2 = 200)", () => {
      const lines: ForecastLineInput[] = [
        { id: "zzz-id", accountId: "a1", name: "zzz", method: "fixed", parameters: { amount: 100 }, startDate: start, endDate: null },
        { id: "aaa-id", accountId: "a2", name: "aaa", method: "custom_formula", parameters: { expression: "zzz * 2" }, startDate: start, endDate: null },
      ];
      const results = computeAllForecastLines(lines, start, end);
      expect(results.get("aaa-id")!.get("2026-01")).toBe(200);
    });

    it("is order-independent (dependent listed before source)", () => {
      const lines: ForecastLineInput[] = [
        { id: "aaa-id", accountId: "a2", name: "aaa", method: "custom_formula", parameters: { expression: "zzz * 2" }, startDate: start, endDate: null },
        { id: "zzz-id", accountId: "a1", name: "zzz", method: "fixed", parameters: { amount: 100 }, startDate: start, endDate: null },
      ];
      const results = computeAllForecastLines(lines, start, end);
      expect(results.get("aaa-id")!.get("2026-01")).toBe(200);
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

  describe("chained percentage_of dependencies (A→B→C)", () => {
    it("resolves a three-level chain", () => {
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
          id: "level1",
          accountId: "a2",
          method: "percentage_of",
          parameters: { sourceLineId: "base", percentage: 0.5 },
          startDate: start,
          endDate: null,
        },
        {
          id: "level2",
          accountId: "a3",
          method: "percentage_of",
          parameters: { sourceLineId: "level1", percentage: 0.2 },
          startDate: start,
          endDate: null,
        },
      ];
      const results = computeAllForecastLines(lines, start, end);
      // base = 10000, level1 = 5000, level2 = 1000
      expect(results.get("base")!.get("2026-01")).toBe(10000);
      expect(results.get("level1")!.get("2026-01")).toBe(5000);
      expect(results.get("level2")!.get("2026-01")).toBe(1000);
    });

    it("resolves lines regardless of input order", () => {
      const lines: ForecastLineInput[] = [
        // Deliberately put the deepest dependent first
        {
          id: "level2",
          accountId: "a3",
          method: "percentage_of",
          parameters: { sourceLineId: "level1", percentage: 0.3 },
          startDate: start,
          endDate: null,
        },
        {
          id: "level1",
          accountId: "a2",
          method: "percentage_of",
          parameters: { sourceLineId: "base", percentage: 0.5 },
          startDate: start,
          endDate: null,
        },
        {
          id: "base",
          accountId: "a1",
          method: "fixed",
          parameters: { amount: 20000 },
          startDate: start,
          endDate: null,
        },
      ];
      const results = computeAllForecastLines(lines, start, end);
      // base = 20000, level1 = 10000, level2 = 3000
      expect(results.get("level2")!.get("2026-01")).toBe(3000);
    });
  });

  describe("circular dependency detection", () => {
    it("throws on circular percentage_of references", () => {
      const lines: ForecastLineInput[] = [
        {
          id: "a",
          accountId: "a1",
          method: "percentage_of",
          parameters: { sourceLineId: "b", percentage: 0.5 },
          startDate: start,
          endDate: null,
        },
        {
          id: "b",
          accountId: "a2",
          method: "percentage_of",
          parameters: { sourceLineId: "a", percentage: 0.3 },
          startDate: start,
          endDate: null,
        },
      ];
      expect(() => computeAllForecastLines(lines, start, end)).toThrow(/[Cc]ircular/);
    });

    it("throws on three-node cycle", () => {
      const lines: ForecastLineInput[] = [
        {
          id: "x",
          accountId: "a1",
          method: "percentage_of",
          parameters: { sourceLineId: "z", percentage: 0.1 },
          startDate: start,
          endDate: null,
        },
        {
          id: "y",
          accountId: "a2",
          method: "percentage_of",
          parameters: { sourceLineId: "x", percentage: 0.1 },
          startDate: start,
          endDate: null,
        },
        {
          id: "z",
          accountId: "a3",
          method: "percentage_of",
          parameters: { sourceLineId: "y", percentage: 0.1 },
          startDate: start,
          endDate: null,
        },
      ];
      expect(() => computeAllForecastLines(lines, start, end)).toThrow(/[Cc]ircular/);
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

    it("handles operator precedence correctly", () => {
      expect(evaluateSimpleExpression("2 + 3 * 4")).toBe(14);
      expect(evaluateSimpleExpression("(2 + 3) * 4")).toBe(20);
    });

    it("handles unary minus", () => {
      expect(evaluateSimpleExpression("-5 + 3")).toBe(-2);
      expect(evaluateSimpleExpression("-(2 + 3)")).toBe(-5);
    });

    it("handles division", () => {
      expect(evaluateSimpleExpression("10 / 4")).toBe(2.5);
      expect(evaluateSimpleExpression("1 / 0")).toBe(0); // Infinity → 0
    });

    it("rejects code injection attempts", () => {
      expect(evaluateSimpleExpression("process.exit()")).toBe(0);
      expect(evaluateSimpleExpression("require('fs')")).toBe(0);
      expect(evaluateSimpleExpression("globalThis")).toBe(0);
      expect(evaluateSimpleExpression("constructor")).toBe(0);
      expect(evaluateSimpleExpression("__proto__")).toBe(0);
      expect(evaluateSimpleExpression("this")).toBe(0);
      expect(evaluateSimpleExpression("import('fs')")).toBe(0);
    });

    it("handles nested parentheses", () => {
      expect(evaluateSimpleExpression("((2 + 3) * (4 - 1))")).toBe(15);
      expect(evaluateSimpleExpression("(((1 + 2)))")).toBe(3);
    });

    it("handles decimal numbers", () => {
      expect(evaluateSimpleExpression("1.5 * 2")).toBe(3);
      expect(evaluateSimpleExpression("0.1 + 0.2")).toBeCloseTo(0.3, 10);
    });
  });
});
