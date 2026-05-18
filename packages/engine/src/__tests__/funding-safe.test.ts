import { describe, it, expect } from "vitest";
import { computeSafeConversion } from "../funding";

describe("computeSafeConversion", () => {
  it("converts at the cap when cap is lower than priced-round pre-money", () => {
    // SAFE: $500K at $5M cap, no discount.
    // Priced round: $20M pre-money. Cap wins.
    // Effective price = $5M / fully-diluted shares (assume 10M shares)
    // SAFE investor gets $500K / $0.50 = 1,000,000 shares.
    const result = computeSafeConversion({
      safeAmount: 500_000,
      safeParams: { valuationCap: 5_000_000 },
      qualifiedRoundPreMoney: 20_000_000,
      qualifiedRoundPricePerShare: 2.0,
      preRoundFullyDilutedShares: 10_000_000,
    });
    expect(result.method).toBe("cap");
    expect(result.effectivePricePerShare).toBeCloseTo(0.5, 2);
    expect(result.sharesIssued).toBe(1_000_000);
  });

  it("converts at the discount when discount beats cap", () => {
    const result = computeSafeConversion({
      safeAmount: 500_000,
      safeParams: { valuationCap: 10_000_000, discountRate: 0.2 },
      qualifiedRoundPreMoney: 5_000_000,
      qualifiedRoundPricePerShare: 1.0,
      preRoundFullyDilutedShares: 5_000_000,
    });
    expect(result.method).toBe("discount");
    expect(result.effectivePricePerShare).toBeCloseTo(0.8, 2);
    expect(result.sharesIssued).toBe(625_000);
  });

  it("converts at priced-round price when no cap and no discount apply", () => {
    const result = computeSafeConversion({
      safeAmount: 100_000,
      safeParams: {},
      qualifiedRoundPreMoney: 5_000_000,
      qualifiedRoundPricePerShare: 1.0,
      preRoundFullyDilutedShares: 5_000_000,
    });
    expect(result.method).toBe("priced");
    expect(result.effectivePricePerShare).toBe(1.0);
    expect(result.sharesIssued).toBe(100_000);
  });

  it("picks the lower effective price (more shares) when both cap and discount apply", () => {
    const result = computeSafeConversion({
      safeAmount: 350_000,
      safeParams: { valuationCap: 5_000_000, discountRate: 0.3 },
      qualifiedRoundPreMoney: 10_000_000,
      qualifiedRoundPricePerShare: 1.0,
      preRoundFullyDilutedShares: 10_000_000,
    });
    expect(result.method).toBe("cap");
    expect(result.effectivePricePerShare).toBe(0.5);
  });
});
