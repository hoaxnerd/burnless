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
});
