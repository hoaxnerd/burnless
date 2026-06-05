import { describe, it, expect } from "vitest";
import { projectActualsForward } from "../utils";
import type { MonthlySeries } from "../utils";

const HORIZON = [
  "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06",
  "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12",
];

describe("projectActualsForward (Phase B carry-forward)", () => {
  it("fills months after the last actual with the trailing average", () => {
    // Actuals Feb–Apr = 100/200/300 → trailing-3 avg = 200 carried May→Dec.
    const actuals: MonthlySeries = new Map([
      ["2026-02", 100],
      ["2026-03", 200],
      ["2026-04", 300],
    ]);
    const result = projectActualsForward(actuals, HORIZON, 3);
    // Actual months are preserved verbatim.
    expect(result.get("2026-02")).toBe(100);
    expect(result.get("2026-04")).toBe(300);
    // Months after the last actual carry the trailing average.
    expect(result.get("2026-05")).toBe(200);
    expect(result.get("2026-12")).toBe(200);
  });

  it("does not mutate the input series", () => {
    const actuals: MonthlySeries = new Map([["2026-03", 50]]);
    projectActualsForward(actuals, HORIZON, 3);
    expect(actuals.has("2026-04")).toBe(false);
    expect(actuals.size).toBe(1);
  });

  it("leaves months before the first actual untouched (no back-fill)", () => {
    const actuals: MonthlySeries = new Map([["2026-04", 80]]);
    const result = projectActualsForward(actuals, HORIZON, 3);
    expect(result.has("2026-01")).toBe(false);
    expect(result.has("2026-03")).toBe(false);
    expect(result.get("2026-04")).toBe(80);
    expect(result.get("2026-05")).toBe(80);
  });

  it("returns an empty series unchanged when there are no actuals", () => {
    const actuals: MonthlySeries = new Map();
    const result = projectActualsForward(actuals, HORIZON, 3);
    expect(result.size).toBe(0);
  });

  it("uses fewer than `trailingMonths` values when only a few actuals exist", () => {
    // Only one actual → trailing average is that single value.
    const actuals: MonthlySeries = new Map([["2026-04", 120]]);
    const result = projectActualsForward(actuals, HORIZON, 3);
    expect(result.get("2026-05")).toBe(120);
  });

  it("does not overwrite an existing actual that falls inside the horizon", () => {
    // Gaps before the last actual are NOT interpolated (carry-forward only).
    const actuals: MonthlySeries = new Map([
      ["2026-01", 10],
      ["2026-04", 40],
    ]);
    const result = projectActualsForward(actuals, HORIZON, 3);
    expect(result.get("2026-01")).toBe(10);
    expect(result.has("2026-02")).toBe(false);
    expect(result.has("2026-03")).toBe(false);
    expect(result.get("2026-05")).toBe(25); // avg of 10 and 40
  });
});
