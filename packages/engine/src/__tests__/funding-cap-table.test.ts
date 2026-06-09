import { describe, it, expect } from "vitest";
import { computeCapTable } from "../funding";

describe("computeCapTable", () => {
  it("composes founders + preferred + option pool into a fully-diluted view", () => {
    const ct = computeCapTable({
      foundersOwnershipPercent: 1.0,
      foundersTotalShares: 10_000_000,
      shareClasses: [
        { id: "common", name: "Common", totalAuthorized: 20_000_000, totalIssued: 10_000_000, liquidationPreference: 1.0 },
        { id: "series-a", name: "Series A Preferred", totalAuthorized: 5_000_000, totalIssued: 3_000_000, liquidationPreference: 1.0 },
      ],
      optionPools: [
        { id: "p1", name: "2026 Plan", totalReserved: 2_000_000, totalGranted: 500_000 },
      ],
      pendingSafes: [],
      pendingConvertibles: [],
    });
    // Overhang = reserved − granted (granted shares already live in commonStock).
    expect(ct.totalFullyDiluted).toBe(14_500_000);
    expect(ct.totals.commonStock).toBe(10_000_000);
    expect(ct.totals.preferredStock).toBe(3_000_000);
    expect(ct.totals.optionPoolOverhang).toBe(1_500_000);
    expect(ct.totals.safeOverhang).toBe(0);
    const founders = ct.rows.find((r) => r.holder === "Founders");
    expect(founders?.ownershipPercent).toBeCloseTo(10_000_000 / 14_500_000, 4);
    // Option-pool row shows unissued (overhang) only, not the full reserve.
    const poolRow = ct.rows.find((r) => r.shareClass === "Option Pool");
    expect(poolRow?.shares).toBe(1_500_000);
    // Cap table foots to 100%: Σ row shares === totalFullyDiluted, Σ ownership ≈ 1.0.
    const sumShares = ct.rows.reduce((s, r) => s + r.shares, 0);
    expect(sumShares).toBe(ct.totalFullyDiluted);
    const sumOwnership = ct.rows.reduce((s, r) => s + r.ownershipPercent, 0);
    expect(sumOwnership).toBeCloseTo(1.0, 6);
  });

  it("models pending SAFE as overhang at its cap", () => {
    const ct = computeCapTable({
      foundersOwnershipPercent: 1.0,
      foundersTotalShares: 10_000_000,
      shareClasses: [
        { id: "common", name: "Common", totalAuthorized: 20_000_000, totalIssued: 10_000_000, liquidationPreference: 1.0 },
      ],
      optionPools: [],
      pendingSafes: [{ id: "s1", amount: 500_000, valuationCap: 5_000_000 }],
      pendingConvertibles: [],
    });
    expect(ct.totals.safeOverhang).toBe(1_000_000);
    expect(ct.totalFullyDiluted).toBe(11_000_000);
  });

  it("models a discount-only SAFE via the implied round price (FAIL-2a)", () => {
    // $100k SAFE, 20% discount, no cap. With a priced round at $1.00/share the
    // implied conversion price is 1.00 × (1 − 0.20) = $0.80 → 100k / 0.80 = 125k shares.
    const ct = computeCapTable({
      foundersOwnershipPercent: 1.0,
      foundersTotalShares: 10_000_000,
      shareClasses: [
        { id: "common", name: "Common", totalAuthorized: 20_000_000, totalIssued: 10_000_000, liquidationPreference: 1.0 },
      ],
      optionPools: [],
      pendingSafes: [
        { id: "s1", amount: 100_000, discountRate: 0.2, roundPricePerShare: 1.0 },
      ],
      pendingConvertibles: [],
    });
    expect(ct.totals.safeOverhang).toBe(125_000);
    expect(ct.totalFullyDiluted).toBe(10_125_000);
    expect(ct.dilutionDataNeedsPricedRound).toBe(false);
    // NB: the SAFE holder row (which makes this fixture foot to 100%) is added
    // in Task 2.4. Here we assert the overhang share count + FD only.
  });

  it("takes the holder-favourable (lowest) of cap and discount price", () => {
    // Cap path: 5,000,000 / 10,000,000 preMoneyFD = $0.50/share.
    // Discount path: 1.00 × (1 − 0.20) = $0.80/share.
    // Holder favours the lower price → cap → 100k / 0.50 = 200k shares.
    const ct = computeCapTable({
      foundersOwnershipPercent: 1.0,
      foundersTotalShares: 10_000_000,
      shareClasses: [
        { id: "common", name: "Common", totalAuthorized: 20_000_000, totalIssued: 10_000_000, liquidationPreference: 1.0 },
      ],
      optionPools: [],
      pendingSafes: [
        { id: "s1", amount: 100_000, valuationCap: 5_000_000, discountRate: 0.2, roundPricePerShare: 1.0 },
      ],
      pendingConvertibles: [],
    });
    expect(ct.totals.safeOverhang).toBe(200_000);
    expect(ct.dilutionDataNeedsPricedRound).toBe(false);
  });

  it("does NOT fabricate overhang for a discount-only SAFE with no implied round price (H2)", () => {
    // Pre-seed common case: a discount SAFE with no cap and no priced round to
    // reference. We must NOT silently estimate 0 dilution as if there were none —
    // we surface a data-availability "needs priced round" state instead.
    const ct = computeCapTable({
      foundersOwnershipPercent: 1.0,
      foundersTotalShares: 10_000_000,
      shareClasses: [
        { id: "common", name: "Common", totalAuthorized: 20_000_000, totalIssued: 10_000_000, liquidationPreference: 1.0 },
      ],
      optionPools: [],
      pendingSafes: [
        { id: "s1", amount: 100_000, discountRate: 0.2 }, // no cap, no roundPricePerShare
      ],
      pendingConvertibles: [],
    });
    expect(ct.totals.safeOverhang).toBe(0); // no fabrication
    expect(ct.totalFullyDiluted).toBe(10_000_000);
    // Data-availability signal: dilution is UNKNOWN, not zero.
    expect(ct.dilutionDataNeedsPricedRound).toBe(true);
  });

  it("emits a SAFE holder row so the cap table foots to 100% (FAIL-2b)", () => {
    // $500k SAFE @ $5M cap, preMoneyFD 10M → cap price $0.50 → 1,000,000 shares.
    const ct = computeCapTable({
      foundersOwnershipPercent: 1.0,
      foundersTotalShares: 10_000_000,
      shareClasses: [
        { id: "common", name: "Common", totalAuthorized: 20_000_000, totalIssued: 10_000_000, liquidationPreference: 1.0 },
      ],
      optionPools: [],
      pendingSafes: [{ id: "s1", amount: 500_000, valuationCap: 5_000_000 }],
      pendingConvertibles: [],
    });
    expect(ct.totals.safeOverhang).toBe(1_000_000);
    expect(ct.totalFullyDiluted).toBe(11_000_000);
    const safeRow = ct.rows.find((r) => r.shareClass === "SAFE");
    expect(safeRow?.shares).toBe(1_000_000);
    expect(safeRow?.ownershipPercent).toBeCloseTo(1_000_000 / 11_000_000, 6);
    // Foots to 100%.
    const sumShares = ct.rows.reduce((s, r) => s + r.shares, 0);
    expect(sumShares).toBe(ct.totalFullyDiluted);
    const sumOwnership = ct.rows.reduce((s, r) => s + r.ownershipPercent, 0);
    expect(sumOwnership).toBeCloseTo(1.0, 6);
  });

  it("converts a convertible note at principal + ACT/365 accrued interest, emits a holder row (FAIL-2b, L1)", () => {
    // $1M convertible @ 8%/yr, $10M cap. Issued 2026-01-01, valued asOf 2026-07-01 (181 days).
    // ACT/365 accrual (consistent with Phase 3.3): 1,000,000 × 0.08 × 181/365 = 39,671.23.
    // Principal + interest = 1,039,671.23. preMoneyFD 10M → cap price $1.00 →
    // 1,039,671.23 / 1.00 floored = 1,039,671 shares.
    const ct = computeCapTable({
      foundersOwnershipPercent: 1.0,
      foundersTotalShares: 10_000_000,
      asOfDate: "2026-07-01",
      shareClasses: [
        { id: "common", name: "Common", totalAuthorized: 20_000_000, totalIssued: 10_000_000, liquidationPreference: 1.0 },
      ],
      optionPools: [],
      pendingSafes: [],
      pendingConvertibles: [
        { id: "c1", amount: 1_000_000, valuationCap: 10_000_000, interestRate: 0.08, issueDate: "2026-01-01" },
      ],
    });
    expect(ct.totals.safeOverhang).toBe(1_039_671);
    expect(ct.totalFullyDiluted).toBe(11_039_671);
    const convRow = ct.rows.find((r) => r.shareClass === "Convertible");
    expect(convRow?.shares).toBe(1_039_671);
    expect(convRow?.ownershipPercent).toBeCloseTo(1_039_671 / 11_039_671, 6);
    // Foots to 100% including the convertible row.
    const sumShares = ct.rows.reduce((s, r) => s + r.shares, 0);
    expect(sumShares).toBe(ct.totalFullyDiluted);
    const sumOwnership = ct.rows.reduce((s, r) => s + r.ownershipPercent, 0);
    expect(sumOwnership).toBeCloseTo(1.0, 6);
  });
});
