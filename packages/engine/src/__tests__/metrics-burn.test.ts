import { describe, it, expect } from "vitest";
import { computeAllMetrics, type MetricsInput } from "../metrics";

const M = (v: Record<string, number>) => new Map(Object.entries(v));

function baseInput(over: Partial<MetricsInput> = {}): MetricsInput {
  return {
    revenue: M({ "2026-06": 0 }),
    totalExpenses: M({ "2026-06": 0 }),
    cogs: M({ "2026-06": 0 }),
    operatingExpenses: M({ "2026-06": 0 }),
    cashPosition: M({ "2026-06": 1_000_000 }),
    netIncome: M({ "2026-06": 0 }),
    headcount: M({ "2026-06": 5 }),
    ...over,
  };
}

describe("gross vs net burn — distinct, coherent stats", () => {
  it("gross burn = total expenses + interest (independent of revenue)", () => {
    const m = computeAllMetrics(
      baseInput({
        revenue: M({ "2026-06": 450_000 }),
        totalExpenses: M({ "2026-06": 200_000 }),
        interestExpense: M({ "2026-06": 8_000 }),
      }),
    );
    expect(m.burnRate.find((x) => x.month === "2026-06")?.value).toBe(208_000);
  });

  it("net burn = max(0, gross − revenue); profitable month floors to 0", () => {
    const m = computeAllMetrics(
      baseInput({
        revenue: M({ "2026-06": 450_000 }),
        totalExpenses: M({ "2026-06": 200_000 }),
        interestExpense: M({ "2026-06": 8_000 }),
      }),
    );
    // gross 208k < revenue 450k -> net floors to 0, but gross stays 208k
    expect(m.netBurnRate.find((x) => x.month === "2026-06")?.value).toBe(0);
  });

  it("burning month: net = gross − revenue", () => {
    const m = computeAllMetrics(
      baseInput({
        revenue: M({ "2026-06": 3_200 }),
        totalExpenses: M({ "2026-06": 240_000 }),
        interestExpense: M({ "2026-06": 0 }),
      }),
    );
    expect(m.burnRate.find((x) => x.month === "2026-06")?.value).toBe(240_000);
    expect(m.netBurnRate.find((x) => x.month === "2026-06")?.value).toBe(236_800);
  });
});
