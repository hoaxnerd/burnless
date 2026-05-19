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

async function computeCapTableInner(
  companyId: string,
  scenarioId: string | null,
): Promise<CapTable> {
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

  const pendingSafes = resolvedRounds
    .filter((r: any) => r.type === "safe")
    .map((r: any) => ({
      id: r.id,
      amount: Number(r.amount),
      valuationCap: (r.parameters as any)?.valuationCap,
      discountRate: (r.parameters as any)?.discountRate,
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
    }));

  const commonClass = classes.find((s) => /common/i.test(s.name));

  return computeCapTable({
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
}

export const computeCapTableForCompany = cache(
  async (companyId: string, scenarioId: string | null): Promise<CapTable> => {
    const cached = unstable_cache(
      async () => computeCapTableInner(companyId, scenarioId),
      ["cap-table", companyId, scenarioId ?? "base"],
      { revalidate: 60, tags: ["cap-table"] },
    );
    return cached();
  },
);
