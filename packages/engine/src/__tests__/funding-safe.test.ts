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

  it("floors fractional shares (does not round up) — $1000 @ $6.6 → 151", () => {
    // $1000 / $6.6 = 151.515... — a true floor yields 151, NOT 152.
    // The buggy `.toFixed(0)` rounds 151.515 → "152" before flooring.
    const result = computeSafeConversion({
      safeAmount: 1_000,
      safeParams: {},
      qualifiedRoundPreMoney: 6_600_000,
      qualifiedRoundPricePerShare: 6.6,
      preRoundFullyDilutedShares: 1_000_000,
    });
    expect(result.method).toBe("priced");
    expect(result.sharesIssued).toBe(151);
  });

  it("zero-guards preRoundFullyDilutedShares: 0 → falls back to priced, finite shares", () => {
    // With a cap but 0 pre-round FD shares, the cap price would be Infinity (div by 0).
    // The cap candidate must be skipped so we fall back to the priced path → finite shares.
    const result = computeSafeConversion({
      safeAmount: 100_000,
      safeParams: { valuationCap: 5_000_000 },
      qualifiedRoundPreMoney: 5_000_000,
      qualifiedRoundPricePerShare: 1.0,
      preRoundFullyDilutedShares: 0,
    });
    expect(result.method).toBe("priced");
    expect(Number.isFinite(result.sharesIssued)).toBe(true);
    expect(result.sharesIssued).toBe(100_000);
  });
});
