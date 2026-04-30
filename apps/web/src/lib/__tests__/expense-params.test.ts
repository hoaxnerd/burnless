import { describe, expect, it } from "vitest";
import {
  defaultParamsForMethod,
  normalizeExpensePayload,
  validateExpenseParams,
} from "../expense-params";

// NOTE: Param shapes mirror the runtime engine (`packages/engine/src/forecasting.ts`).
// The spec draft used `monthlyRate`/`driver`/`unitPrice`/`ofAccountId`/`formula`,
// but the engine actually consumes `monthlyGrowthRate`/`units`+`pricePerUnit`/
// `sourceLineId`/`expression`. Aligned here so produced params round-trip through
// `computeForecastLine` without silent zeros.

describe("defaultParamsForMethod", () => {
  it("returns { amount: 0 } for fixed", () => {
    expect(defaultParamsForMethod("fixed")).toEqual({ amount: 0 });
  });

  it("returns { baseAmount, monthlyGrowthRate } for growth_rate", () => {
    expect(defaultParamsForMethod("growth_rate")).toEqual({
      baseAmount: 0,
      monthlyGrowthRate: 0,
    });
  });

  it("returns { units, pricePerUnit } for per_unit", () => {
    expect(defaultParamsForMethod("per_unit")).toEqual({
      units: 0,
      pricePerUnit: 0,
    });
  });

  it("returns { sourceLineId, percentage } for percentage_of", () => {
    expect(defaultParamsForMethod("percentage_of")).toEqual({
      sourceLineId: "",
      percentage: 0,
    });
  });

  it("returns { expression } for custom_formula", () => {
    expect(defaultParamsForMethod("custom_formula")).toEqual({ expression: "" });
  });
});

describe("normalizeExpensePayload", () => {
  it("coerces ISO date strings to Date objects", () => {
    const result = normalizeExpensePayload({
      method: "fixed",
      parameters: { amount: 100 },
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      frequency: "monthly",
      isOneTime: false,
    });
    expect(result.startDate).toBeInstanceOf(Date);
    expect(result.endDate).toBeInstanceOf(Date);
    expect(result.startDate.toISOString().slice(0, 10)).toBe("2026-01-01");
    expect(result.endDate?.toISOString().slice(0, 10)).toBe("2026-12-31");
  });

  it("preserves Date objects when already Date", () => {
    const d = new Date("2026-03-01");
    const result = normalizeExpensePayload({
      method: "fixed",
      parameters: { amount: 100 },
      startDate: d,
      endDate: null,
      frequency: "monthly",
      isOneTime: false,
    });
    expect(result.startDate).toBe(d);
    expect(result.endDate).toBeNull();
  });
});

describe("validateExpenseParams", () => {
  it("accepts valid fixed params", () => {
    const r = validateExpenseParams("fixed", { amount: 100 });
    expect(r.success).toBe(true);
  });

  it("rejects mismatched method/params (per_unit shape under fixed method)", () => {
    const r = validateExpenseParams("fixed", {
      units: 10,
      pricePerUnit: 50,
    });
    expect(r.success).toBe(false);
  });

  it("accepts valid percentage_of params", () => {
    const r = validateExpenseParams("percentage_of", {
      sourceLineId: "line-1",
      percentage: 0.15,
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty expression for custom_formula", () => {
    const r = validateExpenseParams("custom_formula", { expression: "" });
    expect(r.success).toBe(false);
  });
});
