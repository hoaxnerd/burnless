import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../index";
import { fundingRoundInvestors, shareClasses, optionPools } from "../schema";

export async function listInvestorsForRound(fundingRoundId: string) {
  return db
    .select()
    .from(fundingRoundInvestors)
    .where(eq(fundingRoundInvestors.fundingRoundId, fundingRoundId))
    .orderBy(asc(fundingRoundInvestors.createdAt));
}

export async function listShareClasses(companyId: string) {
  return db
    .select()
    .from(shareClasses)
    .where(and(eq(shareClasses.companyId, companyId), isNull(shareClasses.deletedAt)))
    .orderBy(asc(shareClasses.createdAt));
}

export async function listOptionPools(companyId: string) {
  return db
    .select()
    .from(optionPools)
    .where(and(eq(optionPools.companyId, companyId), isNull(optionPools.deletedAt)))
    .orderBy(asc(optionPools.createdAt));
}
