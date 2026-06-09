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
    // ACT/365: 2026-01-01 → 2026-07-01 = 181 days.
    // 1,000,000 × 0.08 × 181/365 = 39,671.2328... → 39,671.23.
    expect(result.accruedInterest).toBeCloseTo(39_671.23, 2);
    expect(result.principalPlusInterest).toBeCloseTo(1_039_671.23, 2);
    expect(result.method).toBe("cap");
    expect(result.sharesIssued).toBe(1_039_671);
  });

  it("accrues interest on a partial month — ACT/365 day-count (195 days)", () => {
    const result = computeConvertibleNote({
      noteAmount: 1_000_000,
      noteParams: { interestRate: 0.08, valuationCap: 10_000_000 },
      issueDate: "2026-01-01",
      conversionDate: "2026-07-15",
      qualifiedRoundPreMoney: 20_000_000,
      qualifiedRoundPricePerShare: 1.0,
      preRoundFullyDilutedShares: 10_000_000,
    });
    // 2026-01-01 → 2026-07-15 = 195 days.
    // 1,000,000 × 0.08 × 195/365 = 42,739.726... → 42,739.73.
    expect(result.accruedInterest).toBeCloseTo(42_739.73, 2);
    expect(result.principalPlusInterest).toBeCloseTo(1_042_739.73, 2);
  });

  it("guards against a conversion date before issuance — accrued floors at 0", () => {
    const result = computeConvertibleNote({
      noteAmount: 1_000_000,
      noteParams: { interestRate: 0.08, valuationCap: 10_000_000 },
      issueDate: "2026-07-01",
      conversionDate: "2026-01-01",
      qualifiedRoundPreMoney: 20_000_000,
      qualifiedRoundPricePerShare: 1.0,
      preRoundFullyDilutedShares: 10_000_000,
    });
    expect(result.accruedInterest).toBe(0);
    expect(result.principalPlusInterest).toBe(1_000_000);
  });

  it("mirrors the true floor — $1000 note @ $6.6 priced → 151 shares", () => {
    // Convertible delegates to computeSafeConversion, so the floor fix must mirror.
    // $1000 / $6.6 = 151.515... → floor 151, not rounded-up 152.
    const result = computeConvertibleNote({
      noteAmount: 1_000,
      noteParams: { interestRate: 0 },
      issueDate: "2026-01-01",
      conversionDate: "2026-01-01",
      qualifiedRoundPreMoney: 6_600_000,
      qualifiedRoundPricePerShare: 6.6,
      preRoundFullyDilutedShares: 1_000_000,
    });
    expect(result.method).toBe("priced");
    expect(result.sharesIssued).toBe(151);
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
