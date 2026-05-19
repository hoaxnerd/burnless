import { describe, it, expect, vi } from "vitest";

// Mock dependencies that require DB/auth context before importing the module
vi.mock("../auth", () => ({
  auth: vi.fn().mockResolvedValue(null),
}));
vi.mock("@burnless/db", () => ({
  db: { select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }) },
  fundingRounds: {},
  equityGrants: {},
  listShareClasses: vi.fn().mockResolvedValue([]),
  listOptionPools: vi.fn().mockResolvedValue([]),
  resolveEntities: vi.fn().mockResolvedValue([]),
}));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => unknown) => fn,
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: (fn: unknown) => fn };
});

import { computeCapTableForCompany, buildOptionPoolsWithGranted } from "../compute-cap-table";

describe("computeCapTableForCompany", () => {
  it("exports a callable function", () => {
    expect(typeof computeCapTableForCompany).toBe("function");
  });
});

describe("buildOptionPoolsWithGranted", () => {
  // Phase 3 F §F5 — guard against multi-pool input until equityGrants gains optionPoolId.
  it("throws when more than one option pool is supplied", () => {
    expect(() =>
      buildOptionPoolsWithGranted(
        [
          { id: "p1", name: "Pool A", totalReserved: "100" },
          { id: "p2", name: "Pool B", totalReserved: "50" },
        ],
        [],
      ),
    ).toThrow(/multiple option pools/);
  });

  it("returns a single-pool projection with totalGranted summed across all company grants", () => {
    const result = buildOptionPoolsWithGranted(
      [{ id: "p1", name: "Pool A", totalReserved: "1000" }],
      [
        { shares: "100" },
        { shares: "250" },
        { shares: "50" },
      ],
    );
    expect(result).toEqual([
      { id: "p1", name: "Pool A", totalReserved: 1000, totalGranted: 400 },
    ]);
  });

  it("accepts numeric totalReserved and numeric shares (not just DB-numeric strings)", () => {
    const result = buildOptionPoolsWithGranted(
      [{ id: "p1", name: "Pool A", totalReserved: 500 }],
      [{ shares: 200 }, { shares: 300 }],
    );
    expect(result).toEqual([
      { id: "p1", name: "Pool A", totalReserved: 500, totalGranted: 500 },
    ]);
  });

  it("returns totalGranted: 0 for a single pool with no grants issued", () => {
    const result = buildOptionPoolsWithGranted(
      [{ id: "p1", name: "Pool A", totalReserved: "1000" }],
      [],
    );
    expect(result).toEqual([
      { id: "p1", name: "Pool A", totalReserved: 1000, totalGranted: 0 },
    ]);
  });

  it("handles the zero-pool case as a no-op (empty result)", () => {
    expect(buildOptionPoolsWithGranted([], [{ shares: "100" }])).toEqual([]);
  });
});
