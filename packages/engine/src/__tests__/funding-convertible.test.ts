import { describe, it, expect } from "vitest";
import { computeConvertibleNote } from "../funding";

describe("computeConvertibleNote", () => {
  it("accrues interest from issuance to conversion date", () => {
    const result = computeConvertibleNote({
      noteAmount: 1_000_000,
      noteParams: { interestRate: 0.08, valuationCap: 10_000_000 },
      issueDate: "2026-01-01",
      conversionDate: "2026-07-01",
      qualifiedRoundPreMoney: 20_000_000,
      qualifiedRoundPricePerShare: 1.0,
      preRoundFullyDilutedShares: 10_000_000,
    });
    expect(result.accruedInterest).toBeCloseTo(40_000, 0);
    expect(result.principalPlusInterest).toBeCloseTo(1_040_000, 0);
    expect(result.method).toBe("cap");
    expect(result.sharesIssued).toBe(1_040_000);
  });

  it("handles zero interest rate", () => {
    const result = computeConvertibleNote({
      noteAmount: 500_000,
      noteParams: { interestRate: 0, discountRate: 0.2 },
      issueDate: "2026-01-01",
      conversionDate: "2026-12-31",
      qualifiedRoundPreMoney: 5_000_000,
      qualifiedRoundPricePerShare: 1.0,
      preRoundFullyDilutedShares: 5_000_000,
    });
    expect(result.accruedInterest).toBe(0);
    expect(result.principalPlusInterest).toBe(500_000);
  });
});
