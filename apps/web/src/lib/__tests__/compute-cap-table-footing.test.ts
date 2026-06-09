/**
 * U6 — Footing + integration proof for the cap-table UI pipeline.
 *
 * Drives the SERVER compute adapter (`computeCapTableInner` /
 * `computeCapTableForCompany`) with the full multi-entity shape a real founder
 * builds in the /funding/cap-table manager:
 *   - a COMMON share class (founder shares)
 *   - a PREFERRED share class
 *   - an option pool
 *   - an equity grant (eats into the pool reserve)
 *
 * Asserts the cap table FOOTS to 100% — Σ row shares === totalFullyDiluted and
 * Σ ownership ≈ 1.0 — and that `isEmpty` flips FALSE (so the /funding Ownership
 * card leaves its empty state and renders the real founders %). This is the
 * integration proof that the U1–U5 UI surfaces feed correct data through to the
 * engine; the engine's own unit footing is covered by
 * packages/engine/src/__tests__/funding-cap-table.test.ts.
 *
 * Cap-table is shares/percent only — currency-agnostic. No currency assertions.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../auth", () => ({
  auth: vi.fn().mockResolvedValue(null),
}));

// Distinct returns per table: fundingRounds (rounds) vs equityGrants (grants).
// The adapter calls db.select().from(<table>).where(...) for funding rounds and
// again for grants — route each by the table object identity passed to from().
// `vi.hoisted` lets the mock factory (itself hoisted) reference these safely.
const h = vi.hoisted(() => ({
  fundingRoundsTable: { __t: "funding_rounds" },
  equityGrantsTable: { __t: "equity_grants" },
  roundsRows: [] as unknown[],
  grantsRows: [] as { companyId: string; shares: string }[],
}));

vi.mock("@burnless/db", () => ({
  db: {
    select: () => ({
      from: (table: unknown) => ({
        where: () =>
          Promise.resolve(
            table === h.equityGrantsTable ? h.grantsRows : h.roundsRows,
          ),
      }),
    }),
  },
  fundingRounds: h.fundingRoundsTable,
  equityGrants: h.equityGrantsTable,
  listShareClasses: vi.fn(),
  listOptionPools: vi.fn(),
  resolveEntities: vi.fn(async (_t: unknown, base: unknown[]) => base),
}));

vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => unknown) => fn,
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: (fn: unknown) => fn };
});

const getCompanyMock = vi.fn();
vi.mock("../data", () => ({
  getCompany: () => getCompanyMock(),
}));

import { listShareClasses, listOptionPools } from "@burnless/db";
import {
  computeCapTableForCompany,
  computeCapTableInner,
} from "../compute-cap-table";

const FOUNDER_COMMON = 10_000_000;
const PREFERRED_ISSUED = 3_000_000;
const POOL_RESERVED = 2_000_000;
const GRANT_SHARES = 500_000;
// Overhang = reserved − granted (granted already counted inside commonStock).
const EXPECTED_FD = FOUNDER_COMMON + PREFERRED_ISSUED + (POOL_RESERVED - GRANT_SHARES);

function seedFullCapTable() {
  getCompanyMock.mockResolvedValue({
    id: "co-1",
    foundersOwnershipPercent: 100,
  });
  (listShareClasses as ReturnType<typeof vi.fn>).mockResolvedValue([
    {
      id: "common",
      name: "Common",
      classType: "common",
      totalAuthorized: "20000000",
      totalIssued: String(FOUNDER_COMMON),
      liquidationPreference: "1",
    },
    {
      id: "series-a",
      name: "Series A Preferred",
      classType: "preferred",
      totalAuthorized: "5000000",
      totalIssued: String(PREFERRED_ISSUED),
      liquidationPreference: "1",
    },
  ]);
  (listOptionPools as ReturnType<typeof vi.fn>).mockResolvedValue([
    { id: "pool-1", name: "2026 Plan", totalReserved: String(POOL_RESERVED) },
  ]);
  h.roundsRows.length = 0;
  h.grantsRows.length = 0;
  h.grantsRows.push({ companyId: "co-1", shares: String(GRANT_SHARES) });
}

describe("computeCapTableInner — footing proof (U6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedFullCapTable();
  });

  it("foots to 100% for common + preferred + option pool + grant", async () => {
    const t = await computeCapTableInner("co-1", null);

    // Composition totals.
    expect(t.totals.commonStock).toBe(FOUNDER_COMMON);
    expect(t.totals.preferredStock).toBe(PREFERRED_ISSUED);
    expect(t.totals.optionPoolOverhang).toBe(POOL_RESERVED - GRANT_SHARES);
    expect(t.totalFullyDiluted).toBe(EXPECTED_FD);

    // Σ row shares === totalFullyDiluted.
    const sumShares = t.rows.reduce((s, r) => s + r.shares, 0);
    expect(sumShares).toBe(t.totalFullyDiluted);

    // Σ ownership ≈ 1.0 (fully-diluted basis).
    const sumOwnership = t.rows.reduce((s, r) => s + r.ownershipPercent, 0);
    expect(sumOwnership).toBeCloseTo(1.0, 6);

    // Founders row derives from issued common, foots against FD.
    const founders = t.rows.find((r) => r.holder === "Founders");
    expect(founders?.shares).toBe(FOUNDER_COMMON);
    expect(founders?.ownershipPercent).toBeCloseTo(FOUNDER_COMMON / EXPECTED_FD, 6);
  });

  it("flips isEmpty FALSE so the /funding Ownership card leaves its empty state", async () => {
    const t = await computeCapTableInner("co-1", null);
    expect(t.isEmpty).toBe(false);
    expect(t.rows.length).toBeGreaterThan(0);
    expect(t.totalFullyDiluted).toBeGreaterThan(0);
  });

  it("attributes the grant to the pool overhang (granted deducted from reserve)", async () => {
    const t = await computeCapTableInner("co-1", null);
    const poolRow = t.rows.find((r) => r.shareClass === "Option Pool");
    // Pool row shows UNISSUED overhang only (reserved − granted), not full reserve.
    expect(poolRow?.shares).toBe(POOL_RESERVED - GRANT_SHARES);
  });

  it("computeCapTableForCompany (cached path) foots identically", async () => {
    const t = await computeCapTableForCompany("co-1", null);
    const sumShares = t.rows.reduce((s, r) => s + r.shares, 0);
    expect(sumShares).toBe(t.totalFullyDiluted);
    expect(t.isEmpty).toBe(false);
  });
});
