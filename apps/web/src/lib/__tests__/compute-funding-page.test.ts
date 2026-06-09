import { describe, it, expect } from "vitest";
import { computeCapTable, ratioToPct, type CapTable } from "@burnless/engine";
import {
  enrichGrantMilestonesWithWarnings,
  deriveFounderOwnershipFromCapTable,
} from "../compute-funding-page";

describe("deriveFounderOwnershipFromCapTable (H3: single-source founder ownership)", () => {
  it("returns the engine cap-table Founders row ownership as a 0-100 percent", () => {
    // 8M common founders, 2M preferred (Series A). FD = 10M. Founders = 80%.
    const capTable: CapTable = computeCapTable({
      foundersOwnershipPercent: 0.8,
      foundersTotalShares: 8_000_000,
      shareClasses: [
        {
          id: "c1",
          name: "Common",
          classType: "common",
          totalAuthorized: 8_000_000,
          totalIssued: 8_000_000,
          liquidationPreference: 0,
        },
        {
          id: "p1",
          name: "Series A Preferred",
          classType: "preferred",
          totalAuthorized: 2_000_000,
          totalIssued: 2_000_000,
          liquidationPreference: 1,
        },
      ],
      optionPools: [],
      pendingSafes: [],
      pendingConvertibles: [],
    });

    const foundersRow = capTable.rows.find((r) => r.holder === "Founders")!;
    // The cap-table page renders ratioToPct(foundersRow.ownershipPercent).
    const capTableSurfacePct = ratioToPct(foundersRow.ownershipPercent);

    // The /funding headline MUST agree with the reconciled cap table.
    expect(deriveFounderOwnershipFromCapTable(capTable)).toBeCloseTo(80, 6);
    expect(deriveFounderOwnershipFromCapTable(capTable)).toBeCloseTo(capTableSurfacePct, 9);

    // Foots-to-100% evidence: rows shares sum to totalFullyDiluted; ownership sums to 1.0.
    const shareSum = capTable.rows.reduce((s, r) => s + r.shares, 0);
    const ownSum = capTable.rows.reduce((s, r) => s + r.ownershipPercent, 0);
    expect(shareSum).toBe(capTable.totalFullyDiluted);
    expect(ownSum).toBeCloseTo(1.0, 9);
  });

  it("returns 0 when there is no Founders row (empty cap table)", () => {
    const empty: CapTable = {
      rows: [],
      totalFullyDiluted: 0,
      totals: { commonStock: 0, preferredStock: 0, safeOverhang: 0, optionPoolOverhang: 0 },
      dilutionDataNeedsPricedRound: false,
    };
    expect(deriveFounderOwnershipFromCapTable(empty)).toBe(0);
  });

  it("agrees with the cap table after dilution from an option pool (was the divergent case)", () => {
    // 8M common founders + 2M preferred + 1M option pool reserved (0 granted).
    // FD = 11M. Founders = 8M/11M = 72.7272...%.
    const capTable: CapTable = computeCapTable({
      foundersOwnershipPercent: 0.8,
      foundersTotalShares: 8_000_000,
      shareClasses: [
        { id: "c1", name: "Common", classType: "common", totalAuthorized: 8_000_000, totalIssued: 8_000_000, liquidationPreference: 0 },
        { id: "p1", name: "Series A Preferred", classType: "preferred", totalAuthorized: 2_000_000, totalIssued: 2_000_000, liquidationPreference: 1 },
      ],
      optionPools: [{ id: "pool1", name: "Option Pool", totalReserved: 1_000_000, totalGranted: 0 }],
      pendingSafes: [],
      pendingConvertibles: [],
    });

    const foundersRow = capTable.rows.find((r) => r.holder === "Founders")!;
    expect(deriveFounderOwnershipFromCapTable(capTable)).toBeCloseTo(ratioToPct(foundersRow.ownershipPercent), 9);
    expect(deriveFounderOwnershipFromCapTable(capTable)).toBeCloseTo((8_000_000 / 11_000_000) * 100, 6);

    const shareSum = capTable.rows.reduce((s, r) => s + r.shares, 0);
    expect(shareSum).toBe(capTable.totalFullyDiluted);
    expect(capTable.rows.reduce((s, r) => s + r.ownershipPercent, 0)).toBeCloseTo(1.0, 9);
  });
});

describe("enrichGrantMilestonesWithWarnings", () => {
  it("attaches matchWarning to the milestone the warning was raised for", () => {
    const rounds = [
      {
        id: "g1", name: "R&D Grant", type: "grant",
        parameters: {
          milestones: [
            { id: "m1", label: "Q1", amount: 100_000, dueDate: "2026-04-01", hitDate: "2026-04-01" },
            { id: "m2", label: "Q2", amount: 100_000, dueDate: "2026-07-01" },
          ],
        },
      },
    ];
    const warnings = [
      {
        roundId: "g1", roundName: "R&D Grant", milestoneId: "m1", milestoneLabel: "Q1",
        requiredAmount: 200_000, actualAmount: 50_000, asOf: "2026-04-01",
      },
    ];
    const enriched = enrichGrantMilestonesWithWarnings(rounds as any, warnings);
    const grant = enriched.find((r) => r.id === "g1")!;
    const milestones = (grant.parameters as any).milestones;
    const m1 = milestones.find((m: any) => m.id === "m1");
    const m2 = milestones.find((m: any) => m.id === "m2");
    expect(m1.matchWarning).toEqual({ requiredAmount: 200_000, actualAmount: 50_000, asOf: "2026-04-01" });
    expect(m2.matchWarning).toBeUndefined();
  });

  it("leaves non-grant rounds untouched", () => {
    const rounds = [{ id: "r1", name: "Seed", type: "seed", parameters: {} }];
    const enriched = enrichGrantMilestonesWithWarnings(rounds as any, []);
    expect(enriched).toEqual(rounds);
  });
});
