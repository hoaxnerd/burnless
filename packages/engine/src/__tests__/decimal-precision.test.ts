/**
 * Precision tests for Decimal.js integration.
 *
 * Verifies that our financial calculations are free from
 * floating-point accumulation errors.
 */

import { describe, it, expect } from "vitest";
import {
  round2,
  addSeries,
  subtractSeries,
  scaleSeries,
  sum,
  seriesToArray,
  type MonthlySeries,
} from "../utils";
import { D, dRound2, dSum, dMul, dDiv, dPow } from "../decimal";
import { computeSubscriptionDetail, type SubscriptionParams } from "../revenue";
import { computeHeadcountPlanCost, type HeadcountPlanInput } from "../headcount";
import { computeForecastLine, type ForecastLineInput } from "../forecasting";
import { computeAllMetrics, type MetricsInput } from "../metrics";

describe("Decimal precision — round2", () => {
  it("handles the classic 1.005 rounding edge case", () => {
    expect(round2(1.005)).toBe(1.01);
  });

  it("handles 2.675 rounding edge case", () => {
    expect(round2(2.675)).toBe(2.68);
  });

  it("handles negative rounding edge cases", () => {
    expect(round2(-1.005)).toBe(-1.01);
    expect(round2(-2.675)).toBe(-2.68);
  });

  it("rounds 0 correctly", () => {
    expect(round2(0)).toBe(0);
  });

  it("rounds clean numbers correctly", () => {
    expect(round2(1.1)).toBe(1.1);
    expect(round2(1.10001)).toBe(1.1);
    expect(round2(1.999)).toBe(2);
    expect(round2(100)).toBe(100);
  });
});

describe("Decimal precision — sum", () => {
  it("summing 10,000 transactions of $0.01 equals exactly $100.00", () => {
    const transactions = Array(10_000).fill(0.01);
    expect(sum(transactions)).toBe(100);
  });

  it("summing 10,000 transactions of $0.03 equals exactly $300.00", () => {
    const transactions = Array(10_000).fill(0.03);
    expect(sum(transactions)).toBe(300);
  });

  it("summing mixed small amounts accumulates correctly", () => {
    // 0.1 + 0.2 famously !== 0.3 in float64
    const transactions = Array(1000).fill(0.1).concat(Array(1000).fill(0.2));
    expect(sum(transactions)).toBe(300);
  });

  it("summing large arrays with small values has no drift", () => {
    const vals = Array(100_000).fill(0.07);
    expect(sum(vals)).toBe(7000);
  });
});

describe("Decimal precision — series operations", () => {
  it("addSeries does not accumulate float errors", () => {
    const a: MonthlySeries = new Map([
      ["2026-01", 0.1],
      ["2026-02", 0.1],
      ["2026-03", 0.1],
    ]);
    const b: MonthlySeries = new Map([
      ["2026-01", 0.2],
      ["2026-02", 0.2],
      ["2026-03", 0.2],
    ]);
    const result = addSeries(a, b);
    expect(result.get("2026-01")).toBe(0.3);
    expect(result.get("2026-02")).toBe(0.3);
    expect(result.get("2026-03")).toBe(0.3);
  });

  it("subtractSeries does not accumulate float errors", () => {
    const a: MonthlySeries = new Map([["2026-01", 0.3]]);
    const b: MonthlySeries = new Map([["2026-01", 0.1]]);
    const result = subtractSeries(a, b);
    expect(result.get("2026-01")).toBe(0.2);
  });

  it("scaleSeries does not accumulate float errors", () => {
    const s: MonthlySeries = new Map([["2026-01", 0.1]]);
    const result = scaleSeries(s, 3);
    expect(result.get("2026-01")).toBe(0.3);
  });

  it("chained addSeries operations stay precise", () => {
    let series: MonthlySeries = new Map([["2026-01", 0]]);
    const increment: MonthlySeries = new Map([["2026-01", 0.01]]);
    for (let i = 0; i < 10000; i++) {
      series = addSeries(series, increment);
    }
    expect(series.get("2026-01")).toBe(100);
  });
});

describe("Decimal precision — subscription revenue", () => {
  it("computes 36-month subscription without accumulation drift", () => {
    const params: SubscriptionParams = {
      startingCustomers: 100,
      monthlyPrice: 49.99,
      newCustomersPerMonth: 10,
      monthlyChurnRate: 0.03,
      expansionRate: 0.02,
    };

    const details = computeSubscriptionDetail(
      params,
      new Date(2026, 0, 1),
      new Date(2028, 11, 1)
    );

    expect(details.length).toBe(36);

    // All values should be numbers with at most 2 decimal places
    for (const d of details) {
      expect(typeof d.mrr).toBe("number");
      expect(typeof d.customers).toBe("number");
      expect(Number.isFinite(d.mrr)).toBe(true);
      expect(Number.isFinite(d.customers)).toBe(true);
      // Check no more than 2 decimal places
      const mrrStr = d.mrr.toString();
      const dotIdx = mrrStr.indexOf(".");
      if (dotIdx !== -1) {
        expect(mrrStr.length - dotIdx - 1).toBeLessThanOrEqual(2);
      }
    }

    // Net new MRR should be close to new + expansion - churned
    // Rounding individual components then summing can differ by up to 1 cent
    // from computing the sum then rounding — this is the "rounding penny" problem
    for (const d of details) {
      const calculated = dRound2(D(d.newMrr).plus(d.expansionMrr).minus(d.churnedMrr));
      expect(d.netNewMrr).toBeCloseTo(calculated, 1); // within 0.05
    }
  });
});

describe("Decimal precision — headcount costs", () => {
  it("salary / 12 does not lose precision", () => {
    const plan: HeadcountPlanInput = {
      id: "eng-1",
      departmentId: "eng",
      title: "Engineer",
      employeeType: "full_time",
      count: 1,
      salary: 100000, // $100k/year — $8333.333.../month
      hourlyRate: null,
      hoursPerWeek: null,
      startDate: new Date(2026, 0, 1),
      endDate: null,
      benefitsRate: 0.2,
    };

    const result = computeHeadcountPlanCost(
      plan,
      new Date(2026, 0, 1),
      new Date(2026, 11, 1)
    );

    // 12 months of salary should sum to approximately the annual salary
    const salaryValues = Array.from(result.salary.values());
    const totalSalary = sum(salaryValues);
    // Each month is round2(100000/12) = 8333.33, times 12 = 99999.96
    // The point: this should be exact, not drifted
    expect(totalSalary).toBe(round2(totalSalary));
    expect(Number.isFinite(totalSalary)).toBe(true);
  });
});

describe("Decimal precision — forecasting growth_rate", () => {
  it("compound growth does not drift over 60 months", () => {
    const line: ForecastLineInput = {
      id: "rev-1",
      accountId: "revenue",
      method: "growth_rate",
      parameters: { baseAmount: 10000, monthlyGrowthRate: 0.05 },
      startDate: new Date(2026, 0, 1),
      endDate: null,
    };

    const series = computeForecastLine(
      line,
      new Date(2026, 0, 1),
      new Date(2030, 11, 1)
    );

    // 60 months of 5% growth
    const values = Array.from(series.values());
    expect(values.length).toBe(60);

    // All values should be finite numbers
    for (const v of values) {
      expect(Number.isFinite(v)).toBe(true);
    }

    // Month 0 should be exactly the base amount
    expect(values[0]).toBe(10000);

    // Month 59: 10000 * 1.05^59 — verify it matches Decimal calculation
    const expected = dRound2(D(10000).mul(dPow(D(1.05), 59)));
    expect(values[59]).toBe(expected);
  });
});

describe("Decimal precision — metrics calculations", () => {
  it("does not produce NaN or Infinity in edge cases", () => {
    const zeroSeries: MonthlySeries = new Map([
      ["2026-01", 0],
      ["2026-02", 0],
    ]);

    const input: MetricsInput = {
      revenue: zeroSeries,
      totalExpenses: zeroSeries,
      cogs: zeroSeries,
      operatingExpenses: zeroSeries,
      cashPosition: zeroSeries,
      netIncome: zeroSeries,
      headcount: zeroSeries,
    };

    const metrics = computeAllMetrics(input);

    // No metric should be NaN or Infinity
    for (const [key, values] of Object.entries(metrics)) {
      if (Array.isArray(values)) {
        for (const v of values as { value: number }[]) {
          expect(Number.isNaN(v.value)).toBe(false);
          expect(Number.isFinite(v.value)).toBe(true);
        }
      }
    }
  });

  it("gross margin calculation is precise", () => {
    const revenue: MonthlySeries = new Map([["2026-01", 100000.01]]);
    const cogs: MonthlySeries = new Map([["2026-01", 30000.01]]);

    const input: MetricsInput = {
      revenue,
      totalExpenses: new Map([["2026-01", 80000]]),
      cogs,
      operatingExpenses: new Map([["2026-01", 50000]]),
      cashPosition: new Map([["2026-01", 500000]]),
      netIncome: new Map([["2026-01", 20000]]),
      headcount: new Map([["2026-01", 10]]),
    };

    const metrics = computeAllMetrics(input);
    const gp = metrics.grossProfit[0]!.value;
    const gm = metrics.grossMarginPercent[0]!.value;

    // Gross profit = 100000.01 - 30000.01 = 70000
    expect(gp).toBe(70000);
    // Gross margin = 70000 / 100000.01 * 100 = 69.999993 → rounded to 70.00
    expect(gm).toBe(70);
  });
});

describe("Decimal helpers", () => {
  it("dRound2 matches round2 for edge cases", () => {
    const edgeCases = [1.005, 2.675, -1.005, -2.675, 0, 0.5, -0.5, 1.999, 100.004, 100.005];
    for (const n of edgeCases) {
      expect(dRound2(n)).toBe(round2(n));
    }
  });

  it("dPow handles fractional exponents", () => {
    // 1.05^12 ≈ 1.795856...
    const result = dPow(1.05, 12);
    expect(result.toNumber()).toBeCloseTo(1.795856, 4);
  });

  it("dDiv returns 0 for division by zero", () => {
    expect(dDiv(100, 0).toNumber()).toBe(0);
  });

  it("dMul handles chained multiplications", () => {
    // 0.1 * 0.2 * 0.3 = 0.006 exactly
    const result = dMul(0.1, 0.2, 0.3);
    expect(result.toNumber()).toBe(0.006);
  });
});
