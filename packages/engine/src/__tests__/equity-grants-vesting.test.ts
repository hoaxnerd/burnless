import { describe, expect, it } from "vitest";
import { computeVestedSharesSeries, type EquityGrantInput } from "../headcount";

describe("equity grant vesting", () => {
  it("cliff vests on the cliff date, monthly thereafter", () => {
    const grant: EquityGrantInput = {
      id: "g1",
      headcountId: "h",
      grantDate: new Date(2026, 0, 1),
      shares: 4800,
      vestingSchedule: [
        { type: "cliff", date: new Date(2027, 0, 1), sharesVested: 1200 },
        ...Array.from({ length: 36 }, (_, i) => ({
          type: "monthly" as const,
          date: new Date(2027, 1 + i, 1),
          sharesVested: 100,
        })),
      ],
    };
    const series = computeVestedSharesSeries(
      grant,
      new Date(2026, 0, 1),
      new Date(2030, 0, 1),
    );
    expect(series.get("2026-12")).toBe(0);
    expect(series.get("2027-01")).toBe(1200);
    expect(series.get("2027-06")).toBe(1700);
  });

  it("returns zero before any milestone", () => {
    const grant: EquityGrantInput = {
      id: "g",
      headcountId: "h",
      grantDate: new Date(2026, 0, 1),
      shares: 100,
      vestingSchedule: [
        { type: "cliff", date: new Date(2027, 5, 1), sharesVested: 100 },
      ],
    };
    const series = computeVestedSharesSeries(
      grant,
      new Date(2026, 0, 1),
      new Date(2027, 0, 1),
    );
    for (const v of series.values()) expect(v).toBe(0);
  });
});
