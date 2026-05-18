import { describe, it, expect } from "vitest";
import { defaultParamsForType, normalizePayload, validateParams } from "../funding-params";

describe("funding-params", () => {
  it("defaultParamsForType returns reasonable defaults", () => {
    expect(defaultParamsForType("safe")).toEqual({ valuationCap: undefined, discountRate: undefined });
    expect(defaultParamsForType("debt")).toEqual({
      interestRate: 0.08, termMonths: 36, repaymentSchedule: "straight_line",
    });
    expect(defaultParamsForType("grant")).toEqual({ milestones: [] });
  });

  it("validateParams.debt fails when interestRate missing", () => {
    expect(validateParams("debt", {} as any)).toBe("Debt rounds require interestRate and termMonths.");
    expect(validateParams("debt", { interestRate: 0.05, termMonths: 12 })).toBeNull();
  });

  it("validateParams.grant fails on empty milestones", () => {
    expect(validateParams("grant", { milestones: [] })).toBe("Grant rounds require at least one milestone.");
  });
});
