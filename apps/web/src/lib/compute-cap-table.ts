import { cache } from "react";
import { unstable_cache } from "next/cache";
import {
  db,
  fundingRounds,
  equityGrants,
  listShareClasses,
  listOptionPools,
  resolveEntities,
} from "@burnless/db";
import { eq } from "drizzle-orm";
import { computeCapTable, type CapTable } from "@burnless/engine";
import { getCompany } from "./data";

/**
 * Cap-table with an explicit emptiness signal [ESL-1 / FUND-05].
 *
 * `isEmpty` is true only when the cap-table is ALL-derived-zero — no holder rows
 * AND zero fully-diluted shares. Views branch on this to render a `DataEmptyState`
 * instead of an all-zero value grid. Additive: existing consumers ignore it.
 */
export type CapTableWithEmpty = CapTable & { isEmpty: boolean };

/** Strict all-derived-zero predicate: no rows AND nothing fully diluted. */
function capTableIsEmpty(t: CapTable): boolean {
  return t.rows.length === 0 && t.totalFullyDiluted === 0;
}

/**
 * Build the option-pool projection consumed by the engine's computeCapTable.
 * Exported for testability — extracted from computeCapTableInner so the
 * single-pool guard (Phase 3 F §F5) can be exercised without mocking DB calls.
 *
 * Throws when more than one pool is supplied: per-pool grant attribution
 * requires an optionPoolId column on equityGrants (deferred — schema change
 * out of Phase 3 F scope).
 */
export function buildOptionPoolsWithGranted(
  pools: { id: string; name: string; totalReserved: string | number }[],
  grants: { shares: string | number }[],
): { id: string; name: string; totalReserved: number; totalGranted: number }[] {
  // Phase 3 F §F5: equityGrants has no optionPoolId column today, so per-pool
  // attribution is impossible without a schema migration. Cap-table currently
  // supports a single pool only — guard against the multi-pool case so the
  // limitation is loud, not silent. When a second pool is added, an
  // optionPoolId column on equityGrants must land in the same change.
  if (pools.length > 1) {
    throw new Error(
      "compute-cap-table: multiple option pools detected. " +
        "Per-pool grant attribution requires an optionPoolId column on " +
        "equityGrants (deferred — see Phase 3 F §F5). Cap-table currently " +
        "supports a single pool only.",
    );
  }
  const totalGrantedCompanyWide = grants.reduce(
    (sum, g) => sum + Number(g.shares),
    0,
  );
  return pools.map((p) => ({
    id: p.id,
    name: p.name,
    totalReserved: Number(p.totalReserved),
    totalGranted: totalGrantedCompanyWide,
  }));
}

/**
 * Uncached cap-table compute. Use from dynamic/streaming contexts (e.g. the AI
 * display tool `show_cap_table`) where the `unstable_cache` wrapper throws — its
 * inner `getCompany()` reads `headers()`, illegal inside a cache scope unless
 * React `cache()` already resolved it earlier in the request (true on a page
 * render, false inside the SSE chat stream). The cached
 * `computeCapTableForCompany` below remains the page path.
 */
export async function computeCapTableInner(
  companyId: string,
  scenarioId: string | null,
): Promise<CapTableWithEmpty> {
  const company = await getCompany();
  if (!company) {
    return {
      rows: [],
      totalFullyDiluted: 0,
      totals: {
        commonStock: 0,
        preferredStock: 0,
        safeOverhang: 0,
        optionPoolOverhang: 0,
      },
      dilutionDataNeedsPricedRound: false,
      isEmpty: true,
    };
  }

  const [classes, pools, baseRounds] = await Promise.all([
    listShareClasses(companyId),
    listOptionPools(companyId),
    db.select().from(fundingRounds).where(eq(fundingRounds.companyId, companyId)),
  ]);

  const resolvedRounds = await resolveEntities("funding_round", baseRounds, scenarioId);
  const grants = await db
    .select()
    .from(equityGrants)
    .where(eq(equityGrants.companyId, companyId));

  const optionPoolsWithGranted = buildOptionPoolsWithGranted(pools, grants);

  // FAIL-2a: implied conversion price for discount-only SAFEs/convertibles is the
  // latest PRICED round's price/share. A discount with no cap and no implied price
  // cannot be converted to shares — the engine surfaces that as a
  // `dilutionDataNeedsPricedRound` state instead of fabricating 0 dilution (H2).
  const PRICED_TYPES = new Set([
    "pre_seed",
    "seed",
    "series_a",
    "series_b",
    "series_c_plus",
  ]);
  const impliedRoundPrice: number | undefined = resolvedRounds
    .filter(
      (r: any) =>
        PRICED_TYPES.has(r.type) &&
        Number((r.parameters as any)?.pricePerShare) > 0,
    )
    .map((r: any) => ({
      date: r.date instanceof Date ? r.date : new Date(r.date),
      price: Number((r.parameters as any).pricePerShare),
    }))
    .sort((a, b) => b.date.getTime() - a.date.getTime())[0]?.price;

  const pendingSafes = resolvedRounds
    .filter((r: any) => r.type === "safe")
    .map((r: any) => ({
      id: r.id,
      amount: Number(r.amount),
      valuationCap: (r.parameters as any)?.valuationCap,
      discountRate: (r.parameters as any)?.discountRate,
      roundPricePerShare: impliedRoundPrice,
    }));

  const pendingConvertibles = resolvedRounds
    .filter((r: any) => r.type === "convertible")
    .map((r: any) => ({
      id: r.id,
      amount: Number(r.amount),
      valuationCap: (r.parameters as any)?.valuationCap,
      discountRate: (r.parameters as any)?.discountRate,
      interestRate: (r.parameters as any)?.interestRate,
      issueDate: (r.date instanceof Date ? r.date : new Date(r.date))
        .toISOString()
        .slice(0, 10),
      roundPricePerShare: impliedRoundPrice,
    }));

  const commonClass = classes.find((s) => /common/i.test(s.name));

  const capTable = computeCapTable({
    foundersOwnershipPercent:
      company.foundersOwnershipPercent != null
        ? Number(company.foundersOwnershipPercent) / 100
        : 0.8,
    foundersTotalShares: commonClass ? Number(commonClass.totalIssued) : 10_000_000,
    shareClasses: classes.map((s) => ({
      id: s.id,
      name: s.name,
      totalAuthorized: Number(s.totalAuthorized),
      totalIssued: Number(s.totalIssued),
      liquidationPreference: Number(s.liquidationPreference),
    })),
    optionPools: optionPoolsWithGranted,
    pendingSafes,
    pendingConvertibles,
  });

  return { ...capTable, isEmpty: capTableIsEmpty(capTable) };
}

export const computeCapTableForCompany = cache(
  async (companyId: string, scenarioId: string | null): Promise<CapTableWithEmpty> => {
    const cached = unstable_cache(
      async () => computeCapTableInner(companyId, scenarioId),
      ["cap-table", companyId, scenarioId ?? "base"],
      { revalidate: 60, tags: ["cap-table"] },
    );
    return cached();
  },
);
