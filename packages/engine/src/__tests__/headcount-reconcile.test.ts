import { describe, it, expect } from "vitest";
import { reconcileHeadcountWithActuals } from "../headcount";

describe("reconcileHeadcountWithActuals — prevent salary double-count", () => {
  const hc = new Map([
    ["2026-01", 36000],
    ["2026-02", 36000],
    ["2026-03", 36000],
    ["2026-04", 40000],
    ["2026-05", 40000],
  ]);

  it("suppresses headcount-plan cost in months that have personnel actuals", () => {
    // Jan-Mar have real payroll transactions on a coversHeadcount account.
    const personnelActualMonths = new Set(["2026-01", "2026-02", "2026-03"]);
    const out = reconcileHeadcountWithActuals(hc, personnelActualMonths);
    expect(out.get("2026-01")).toBe(0);
    expect(out.get("2026-02")).toBe(0);
    expect(out.get("2026-03")).toBe(0);
    // Future months (no actuals) keep the plan projection.
    expect(out.get("2026-04")).toBe(40000);
    expect(out.get("2026-05")).toBe(40000);
  });

  it("is a no-op when there are no personnel actuals (headcount-plan-only companies)", () => {
    const out = reconcileHeadcountWithActuals(hc, new Set());
    expect(out).toEqual(hc);
  });

  it("does not mutate the input series", () => {
    const personnelActualMonths = new Set(["2026-01"]);
    reconcileHeadcountWithActuals(hc, personnelActualMonths);
    expect(hc.get("2026-01")).toBe(36000);
  });
});
