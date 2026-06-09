import { describe, it, expect } from "vitest";
import {
  evaluateFormula,
  evaluateSimpleExpression,
  validateFormula,
  type FormulaContext,
} from "../formula";
import type { MonthlySeries } from "../utils";

describe("formula evaluator", () => {
  // ── Basic arithmetic ────────────────────────────────────────────────────────

  describe("basic arithmetic", () => {
    it("addition", () => {
      expect(evaluateSimpleExpression("2 + 3")).toBe(5);
      expect(evaluateSimpleExpression("100 + 200 + 300")).toBe(600);
    });

    it("subtraction", () => {
      expect(evaluateSimpleExpression("10 - 3")).toBe(7);
      expect(evaluateSimpleExpression("100 - 50 - 25")).toBe(25);
    });

    it("multiplication", () => {
      expect(evaluateSimpleExpression("6 * 7")).toBe(42);
      expect(evaluateSimpleExpression("1000 * 0.1")).toBe(100);
    });

    it("division", () => {
      expect(evaluateSimpleExpression("10 / 4")).toBe(2.5);
      expect(evaluateSimpleExpression("100 / 3")).toBeCloseTo(33.333, 2);
    });

    it("modulo", () => {
      expect(evaluateSimpleExpression("10 % 3")).toBe(1);
      expect(evaluateSimpleExpression("17 % 5")).toBe(2);
    });

    it("exponentiation", () => {
      expect(evaluateSimpleExpression("2 ^ 10")).toBe(1024);
      expect(evaluateSimpleExpression("3 ^ 2")).toBe(9);
    });

    it("operator precedence", () => {
      expect(evaluateSimpleExpression("2 + 3 * 4")).toBe(14);
      expect(evaluateSimpleExpression("(2 + 3) * 4")).toBe(20);
      expect(evaluateSimpleExpression("10 - 2 * 3")).toBe(4);
    });

    it("unary minus", () => {
      expect(evaluateSimpleExpression("-5 + 3")).toBe(-2);
      expect(evaluateSimpleExpression("-(2 + 3)")).toBe(-5);
    });

    it("nested parentheses", () => {
      expect(evaluateSimpleExpression("((2 + 3) * (4 - 1))")).toBe(15);
      expect(evaluateSimpleExpression("(((1 + 2)))")).toBe(3);
    });

    it("decimal numbers", () => {
      expect(evaluateSimpleExpression("1.5 * 2")).toBe(3);
      expect(evaluateSimpleExpression("0.1 + 0.2")).toBeCloseTo(0.3, 10);
    });

    it("division by zero returns Infinity → 0", () => {
      expect(evaluateSimpleExpression("1 / 0")).toBe(0);
    });
  });

  // ── Variables ───────────────────────────────────────────────────────────────

  describe("variable substitution", () => {
    it("basic variable substitution", () => {
      expect(evaluateSimpleExpression("base * 2", { base: 500 })).toBe(1000);
    });

    it("multiple variables", () => {
      expect(
        evaluateSimpleExpression("revenue - expenses", { revenue: 50000, expenses: 30000 })
      ).toBe(20000);
    });

    it("variable in complex expression", () => {
      expect(
        evaluateSimpleExpression("base * (1 + rate)", { base: 1000, rate: 0.1 })
      ).toBe(1100);
    });

    it("month variable (auto-injected by forecasting)", () => {
      expect(
        evaluateSimpleExpression("base + month * step", { base: 1000, step: 100, month: 3 })
      ).toBe(1300);
    });
  });

  // ── Built-in functions ──────────────────────────────────────────────────────

  describe("built-in functions", () => {
    it("min()", () => {
      expect(evaluateSimpleExpression("min(10, 20)")).toBe(10);
      expect(evaluateSimpleExpression("min(5, 3, 8, 1)")).toBe(1);
    });

    it("max()", () => {
      expect(evaluateSimpleExpression("max(10, 20)")).toBe(20);
      expect(evaluateSimpleExpression("max(5, 3, 8, 1)")).toBe(8);
    });

    it("floor()", () => {
      expect(evaluateSimpleExpression("floor(3.7)")).toBe(3);
      expect(evaluateSimpleExpression("floor(100000 / 20000)")).toBe(5);
    });

    it("ceil()", () => {
      expect(evaluateSimpleExpression("ceil(3.2)")).toBe(4);
      expect(evaluateSimpleExpression("ceil(10.01)")).toBe(11);
    });

    it("ceiling() as alias for ceil()", () => {
      expect(evaluateSimpleExpression("ceiling(3.2)")).toBe(4);
    });

    it("round()", () => {
      expect(evaluateSimpleExpression("round(3.5)")).toBe(4);
      expect(evaluateSimpleExpression("round(3.4)")).toBe(3);
    });

    it("abs()", () => {
      expect(evaluateSimpleExpression("abs(-42)")).toBe(42);
      expect(evaluateSimpleExpression("abs(42)")).toBe(42);
    });

    it("sqrt()", () => {
      expect(evaluateSimpleExpression("sqrt(144)")).toBe(12);
      expect(evaluateSimpleExpression("sqrt(2)")).toBeCloseTo(1.4142, 3);
    });

    it("pow()", () => {
      expect(evaluateSimpleExpression("pow(2, 8)")).toBe(256);
    });

    it("functions in complex expressions", () => {
      // Real use case: headcount = floor(revenue / 20000) * salary
      expect(
        evaluateSimpleExpression("floor(revenue / 20000) * salary", {
          revenue: 150000,
          salary: 8000,
        })
      ).toBe(56000); // floor(7.5) * 8000 = 7 * 8000
    });
  });

  // ── Custom if() function ────────────────────────────────────────────────────

  describe("if() conditional", () => {
    it("returns thenValue when condition > 0", () => {
      const result = evaluateFormula("if(1, 100, 200)");
      expect(result.value).toBe(100);
    });

    it("returns elseValue when condition <= 0", () => {
      const result = evaluateFormula("if(0, 100, 200)");
      expect(result.value).toBe(200);

      const negResult = evaluateFormula("if(-1, 100, 200)");
      expect(negResult.value).toBe(200);
    });

    it("works with variable conditions", () => {
      const result = evaluateFormula("if(runway, revenue, 0)", {
        variables: { runway: 6, revenue: 50000 },
      });
      expect(result.value).toBe(50000);
    });

    it("works with expression conditions", () => {
      const result = evaluateFormula("if(revenue - expenses, revenue, 0)", {
        variables: { revenue: 50000, expenses: 30000 },
      });
      expect(result.value).toBe(50000); // 20000 > 0, so returns revenue
    });
  });

  // ── Time offsets ────────────────────────────────────────────────────────────

  describe("time offsets", () => {
    const monthKeys = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];

    function makeRevenueSeries(): MonthlySeries {
      const s: MonthlySeries = new Map();
      s.set("2026-01", 10000);
      s.set("2026-02", 12000);
      s.set("2026-03", 14000);
      s.set("2026-04", 16000);
      s.set("2026-05", 18000);
      s.set("2026-06", 20000);
      return s;
    }

    it("resolves [-1] to previous month value", () => {
      const ctx: FormulaContext = {
        resolvedSeries: new Map([["Revenue.Total", makeRevenueSeries()]]),
        currentMonthKey: "2026-03",
        allMonthKeys: monthKeys,
      };
      const result = evaluateFormula("Revenue.Total[-1]", ctx);
      expect(result.value).toBe(12000); // Feb value
    });

    it("resolves [-2] to two months back", () => {
      const ctx: FormulaContext = {
        resolvedSeries: new Map([["Revenue.Total", makeRevenueSeries()]]),
        currentMonthKey: "2026-04",
        allMonthKeys: monthKeys,
      };
      const result = evaluateFormula("Revenue.Total[-2]", ctx);
      expect(result.value).toBe(12000); // Feb value
    });

    it("returns 0 when offset goes out of range", () => {
      const ctx: FormulaContext = {
        resolvedSeries: new Map([["Revenue.Total", makeRevenueSeries()]]),
        currentMonthKey: "2026-01",
        allMonthKeys: monthKeys,
      };
      const result = evaluateFormula("Revenue.Total[-1]", ctx);
      expect(result.value).toBe(0); // No month before Jan
    });

    it("time offset in complex expression", () => {
      const ctx: FormulaContext = {
        resolvedSeries: new Map([["Revenue.Total", makeRevenueSeries()]]),
        currentMonthKey: "2026-03",
        allMonthKeys: monthKeys,
        variables: { target: 15000 },
      };
      // Growth = current - previous
      const result = evaluateFormula("Revenue.Total[-1] * 1.1", ctx);
      // 12000 * 1.1 = 13200
      expect(result.value).toBeCloseTo(13200, 2);
    });
  });

  // ── Dotted variable references (current period) ─────────────────────────────

  describe("dotted variable references", () => {
    it("resolves Revenue.Total to current month value", () => {
      const series: MonthlySeries = new Map([["2026-03", 50000]]);
      const ctx: FormulaContext = {
        resolvedSeries: new Map([["Revenue.Total", series]]),
        currentMonthKey: "2026-03",
        allMonthKeys: ["2026-03"],
      };
      const result = evaluateFormula("Revenue.Total / 10", ctx);
      expect(result.value).toBe(5000);
    });

    it("resolves deeply nested dotted names", () => {
      const series: MonthlySeries = new Map([["2026-03", 12]]);
      const ctx: FormulaContext = {
        resolvedSeries: new Map([["Headcount.Engineering.Total", series]]),
        currentMonthKey: "2026-03",
        allMonthKeys: ["2026-03"],
      };
      const result = evaluateFormula("Headcount.Engineering.Total * 8000", ctx);
      expect(result.value).toBe(96000);
    });
  });

  // ── Flat identifier references from resolvedSeries (Phase 4 §4.2) ───────────

  describe("flat identifier references from resolvedSeries", () => {
    it("resolves a flat line name to its current-month value", () => {
      const series: MonthlySeries = new Map([["2026-03", 100]]);
      const ctx: FormulaContext = {
        resolvedSeries: new Map([["CloudCosts", series]]),
        currentMonthKey: "2026-03",
        allMonthKeys: ["2026-03"],
      };
      const result = evaluateFormula("CloudCosts * 2", ctx);
      expect(result.value).toBe(200);
    });

    it("explicit variable wins over a same-named series", () => {
      const series: MonthlySeries = new Map([["2026-03", 100]]);
      const ctx: FormulaContext = {
        resolvedSeries: new Map([["x", series]]),
        currentMonthKey: "2026-03",
        allMonthKeys: ["2026-03"],
        variables: { x: 7 },
      };
      const result = evaluateFormula("x * 2", ctx);
      expect(result.value).toBe(14); // 7 (explicit), not 100 (series)
    });

    it("function names are not treated as flat references", () => {
      const ctx: FormulaContext = {
        resolvedSeries: new Map(),
        currentMonthKey: "2026-03",
        allMonthKeys: ["2026-03"],
      };
      const result = evaluateFormula("max(1, 2)", ctx);
      expect(result.value).toBe(2); // max stays a function
    });

    it("injected month variable wins over a same-named series", () => {
      const series: MonthlySeries = new Map([["2026-03", 100]]);
      const ctx: FormulaContext = {
        resolvedSeries: new Map([["month", series]]),
        currentMonthKey: "2026-03",
        allMonthKeys: ["2026-03"],
        variables: { month: 3 },
      };
      const result = evaluateFormula("month + 1", ctx);
      expect(result.value).toBe(4); // 3 (injected month), not 100 (series)
    });

    it("missing flat reference resolves to 0", () => {
      const ctx: FormulaContext = {
        resolvedSeries: new Map([["CloudCosts", new Map([["2026-03", 100]])]]),
        currentMonthKey: "2026-03",
        allMonthKeys: ["2026-03"],
      };
      // ServerCosts has no series → 0; CloudCosts present → 100; 100 + 0
      const result = evaluateFormula("CloudCosts + ServerCosts", ctx);
      expect(result.value).toBe(100);
    });
  });

  // ── Real-world formulas ─────────────────────────────────────────────────────

  describe("real-world formula patterns", () => {
    it("hiring driver: floor(Revenue.Total/20000) - current headcount", () => {
      const revenueSeries: MonthlySeries = new Map([["2026-03", 150000]]);
      const headcountSeries: MonthlySeries = new Map([["2026-02", 5], ["2026-03", 6]]);

      const ctx: FormulaContext = {
        resolvedSeries: new Map([
          ["Revenue.Total", revenueSeries],
          ["Headcount.Sales.Total", headcountSeries],
        ]),
        currentMonthKey: "2026-03",
        allMonthKeys: ["2026-01", "2026-02", "2026-03"],
      };

      // floor(150000/20000) - previous headcount = 7 - 5 = 2
      const result = evaluateFormula(
        "floor(Revenue.Total / 20000) - Headcount.Sales.Total[-1]",
        ctx
      );
      expect(result.value).toBe(2);
    });

    it("capped expense: min(budget, actual_spend)", () => {
      const result = evaluateFormula("min(budget, spend)", {
        variables: { budget: 50000, spend: 65000 },
      });
      expect(result.value).toBe(50000);
    });

    it("growth calculation: (current - previous) / previous * 100", () => {
      const series: MonthlySeries = new Map([
        ["2026-01", 10000],
        ["2026-02", 12000],
      ]);
      const ctx: FormulaContext = {
        resolvedSeries: new Map([["MRR", series]]),
        currentMonthKey: "2026-02",
        allMonthKeys: ["2026-01", "2026-02"],
      };
      // MRR current is resolved as a dotted var? No, "MRR" is single segment.
      // Use flat variable for current, offset for previous
      const result = evaluateFormula("(current - MRR[-1]) / MRR[-1] * 100", {
        ...ctx,
        variables: { current: 12000 },
      });
      expect(result.value).toBe(20); // 20% growth
    });
  });

  // ── Validation ──────────────────────────────────────────────────────────────

  describe("validateFormula", () => {
    it("rejects empty expressions", () => {
      expect(validateFormula("")).toBe("Empty expression");
      expect(validateFormula("   ")).toBe("Empty expression");
    });

    it("rejects very long expressions", () => {
      const long = "x + ".repeat(300);
      expect(validateFormula(long)).toBe("Expression too long (max 1000 characters)");
    });

    it("rejects dangerous keywords", () => {
      expect(validateFormula("import('fs')")).toBe("Expression contains disallowed keyword");
      expect(validateFormula("require('child_process')")).toBe("Expression contains disallowed keyword");
      expect(validateFormula("process.exit()")).toBe("Expression contains disallowed keyword");
      expect(validateFormula("eval('code')")).toBe("Expression contains disallowed keyword");
      expect(validateFormula("globalThis")).toBe("Expression contains disallowed keyword");
    });

    it("accepts valid formulas", () => {
      expect(validateFormula("2 + 3")).toBeUndefined();
      expect(validateFormula("floor(x / 20000)")).toBeUndefined();
      expect(validateFormula("Revenue.Total[-1] * 1.1")).toBeUndefined();
      expect(validateFormula("min(a, b) + max(c, d)")).toBeUndefined();
    });
  });

  // ── Security ────────────────────────────────────────────────────────────────

  describe("security", () => {
    it("rejects process.exit()", () => {
      expect(evaluateSimpleExpression("process.exit()")).toBe(0);
    });

    it("rejects require()", () => {
      expect(evaluateSimpleExpression("require('fs')")).toBe(0);
    });

    it("rejects globalThis", () => {
      expect(evaluateSimpleExpression("globalThis")).toBe(0);
    });

    it("rejects import()", () => {
      expect(evaluateSimpleExpression("import('fs')")).toBe(0);
    });

    it("rejects eval()", () => {
      expect(evaluateSimpleExpression("eval('1+1')")).toBe(0);
    });

    it("rejects Function constructor", () => {
      expect(evaluateSimpleExpression("Function('return 1')()")).toBe(0);
    });

    it("returns 0 for empty expression", () => {
      expect(evaluateSimpleExpression("")).toBe(0);
    });
  });

  // ── Error handling ──────────────────────────────────────────────────────────

  describe("error handling", () => {
    it("returns error for malformed expressions", () => {
      const result = evaluateFormula("2 +");
      expect(result.value).toBe(0);
      expect(result.error).toBeDefined();
    });

    it("returns error for unmatched parentheses", () => {
      const result = evaluateFormula("(2 + 3");
      expect(result.value).toBe(0);
      expect(result.error).toBeDefined();
    });

    it("returns 0 for undefined variables (mathjs throws)", () => {
      const result = evaluateFormula("undefined_var + 5");
      expect(result.value).toBe(0);
      expect(result.error).toBeDefined();
    });
  });

  // ── Integration with forecasting ────────────────────────────────────────────

  describe("integration with computeForecastLine", () => {
    it("custom_formula with floor() and variables works end-to-end", async () => {
      // This tests the full pipeline: forecasting.ts → formula.ts
      const { computeForecastLine } = await import("../forecasting");
      const start = new Date(2026, 0, 1);
      const end = new Date(2026, 2, 1);

      const line = {
        id: "test",
        accountId: "a1",
        method: "custom_formula" as const,
        parameters: {
          expression: "base + month * step",
          variables: { base: 1000, step: 200 },
        },
        startDate: start,
        endDate: null,
      };

      const result = computeForecastLine(line, start, end);
      expect(result.get("2026-01")).toBe(1000); // month=0: 1000 + 0*200
      expect(result.get("2026-02")).toBe(1200); // month=1: 1000 + 1*200
      expect(result.get("2026-03")).toBe(1400); // month=2: 1000 + 2*200
    });
  });
});
