import { describe, it, expect } from "vitest";
import { computeAllMetrics } from "../metrics";
import { monthRange } from "../utils";

const months = monthRange("2026-01-01", "2026-03-31").map(
  (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
);

/** Minimal required fields beyond what each test exercises. */
const empty = new Map<string, number>(months.map((m) => [m, 0]));
const baseRequired = {
  cogs: empty,
  operatingExpenses: empty,
  netIncome: empty,
  headcount: empty,
};

describe("Phase 2 D §1.4 D6: runway/burn meaning changes", () => {
  it("netBurnRate adds interestExpense to operating burn (interest IS operating)", () => {
    const result = computeAllMetrics({
      revenue: new Map(months.map((m) => [m, 0])),
      totalExpenses: new Map(months.map((m) => [m, 80_000])),
      cashPosition: new Map(months.map((m) => [m, 500_000])),
      interestExpense: new Map(months.map((m) => [m, 5_000])),
      principalPayments: new Map(months.map((m) => [m, 0])),
      ...baseRequired,
    });
    expect(result.netBurnRate.find((x) => x.month === "2026-01")?.value).toBe(85_000);
  });

  it("netBurnRate does NOT include principal (principal is financing)", () => {
    const result = computeAllMetrics({
      revenue: new Map(months.map((m) => [m, 0])),
      totalExpenses: new Map(months.map((m) => [m, 80_000])),
      cashPosition: new Map(months.map((m) => [m, 500_000])),
      interestExpense: new Map(months.map((m) => [m, 0])),
      principalPayments: new Map(months.map((m) => [m, 20_000])),
      ...baseRequired,
    });
    expect(result.netBurnRate.find((x) => x.month === "2026-01")?.value).toBe(80_000);
  });

  it("cashRunwayMonths nets both interest (via burn) + principal (added to denominator)", () => {
    const result = computeAllMetrics({
      revenue: new Map(months.map((m) => [m, 0])),
      totalExpenses: new Map(months.map((m) => [m, 80_000])),
      cashPosition: new Map(months.map((m) => [m, 1_000_000])),
      interestExpense: new Map(months.map((m) => [m, 5_000])),
      principalPayments: new Map(months.map((m) => [m, 15_000])),
      ...baseRequired,
    });
    // operatingBurn = 80_000 + 5_000 = 85_000; totalCash = 85_000 + 15_000 = 100_000
    // runway = 1_000_000 / 100_000 = 10
    expect(result.cashRunwayMonths.find((x) => x.month === "2026-01")?.value).toBe(10);
  });

  it("backwards-compatible: no interest/principal → identical to pre-Phase-2 behavior", () => {
    const result = computeAllMetrics({
      revenue: new Map([["2026-01", 0]]),
      totalExpenses: new Map([["2026-01", 100_000]]),
      cashPosition: new Map([["2026-01", 1_000_000]]),
      cogs: new Map([["2026-01", 0]]),
      operatingExpenses: new Map([["2026-01", 0]]),
      netIncome: new Map([["2026-01", 0]]),
      headcount: new Map([["2026-01", 0]]),
    });
    expect(result.netBurnRate[0]?.value).toBe(100_000);
    expect(result.cashRunwayMonths[0]?.value).toBe(10);
  });
});
