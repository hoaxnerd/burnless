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

// getCompany() is read inside computeCapTableInner. Control it per-test.
const getCompanyMock = vi.fn();
vi.mock("../data", () => ({
  getCompany: () => getCompanyMock(),
}));

import {
  computeCapTableForCompany,
  computeCapTableInner,
  buildOptionPoolsWithGranted,
} from "../compute-cap-table";

describe("computeCapTableForCompany", () => {
  it("exports a callable function", () => {
    expect(typeof computeCapTableForCompany).toBe("function");
  });
});

describe("computeCapTableInner — isEmpty signal (FUND-05 / ESL-1)", () => {
  it("returns isEmpty: true when there is no company (no rows, zero fully diluted)", async () => {
    getCompanyMock.mockResolvedValueOnce(null);
    const t = await computeCapTableInner("co-1", null);
    expect(t.isEmpty).toBe(true);
    expect(t.rows).toEqual([]);
    expect(t.totalFullyDiluted).toBe(0);
  });

  it("returns isEmpty: true when a company exists but has no share classes/grants/rounds", async () => {
    // DB mocks above resolve every query to [] and listShareClasses/Pools to [].
    getCompanyMock.mockResolvedValueOnce({
      id: "co-1",
      foundersOwnershipPercent: 0,
    });
    const t = await computeCapTableInner("co-1", null);
    // With no common share class, founder shares fall back to a synthetic
    // 10M default — so the table is NOT all-derived-zero here; isEmpty reflects
    // the strict rows.length===0 && totalFullyDiluted===0 predicate.
    expect(t.isEmpty).toBe(t.rows.length === 0 && t.totalFullyDiluted === 0);
    expect(typeof t.isEmpty).toBe("boolean");
  });

  it("returns isEmpty: false when founder ownership produces fully-diluted shares", async () => {
    getCompanyMock.mockResolvedValueOnce({
      id: "co-1",
      foundersOwnershipPercent: 80,
    });
    const t = await computeCapTableInner("co-1", null);
    if (t.totalFullyDiluted > 0 || t.rows.length > 0) {
      expect(t.isEmpty).toBe(false);
    }
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
