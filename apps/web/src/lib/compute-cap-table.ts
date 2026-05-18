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

  const optionPoolsWithGranted = pools.map((p) => ({
    id: p.id,
    name: p.name,
    totalReserved: Number(p.totalReserved),
    totalGranted: grants.reduce((sum, g) => sum + Number(g.shares), 0),
  }));

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
