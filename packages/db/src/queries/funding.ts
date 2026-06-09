import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../index";
import { fundingRoundInvestors, shareClasses, optionPools } from "../schema";
import { updateForCompany } from "./crud";

type NewShareClass = typeof shareClasses.$inferInsert;
type NewOptionPool = typeof optionPools.$inferInsert;

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

// ── Share-class CRUD (soft-delete) ──────────────────────────────────────────
// Cap-table contract: callers String()-coerce numeric() columns (numeric(18,0)
// share counts are STRINGS) before passing data; these helpers pass through.
// DELETE is SOFT (deletedAt) so listShareClasses keeps filtering isNull(deletedAt).

export async function createShareClass(
  companyId: string,
  data: Omit<NewShareClass, "companyId" | "id" | "createdAt" | "deletedAt">,
) {
  const [row] = await db
    .insert(shareClasses)
    .values({ ...data, companyId })
    .returning();
  return row!;
}

export async function updateShareClass(
  id: string,
  companyId: string,
  changes: Partial<NewShareClass>,
) {
  return updateForCompany(shareClasses, id, companyId, changes);
}

export async function softDeleteShareClass(id: string, companyId: string) {
  return updateForCompany(shareClasses, id, companyId, { deletedAt: new Date() });
}

// ── Option-pool CRUD (soft-delete) ──────────────────────────────────────────

export async function createOptionPool(
  companyId: string,
  data: Omit<NewOptionPool, "companyId" | "id" | "createdAt" | "deletedAt">,
) {
  const [row] = await db
    .insert(optionPools)
    .values({ ...data, companyId })
    .returning();
  return row!;
}

export async function updateOptionPool(
  id: string,
  companyId: string,
  changes: Partial<NewOptionPool>,
) {
  return updateForCompany(optionPools, id, companyId, changes);
}

export async function softDeleteOptionPool(id: string, companyId: string) {
  return updateForCompany(optionPools, id, companyId, { deletedAt: new Date() });
}

/**
 * Count non-deleted option pools for a company. Powers the single-pool guard
 * (Phase 3 F §F5): POST /api/option-pools rejects a 2nd pool when this is ≥ 1.
 */
export async function countOptionPools(companyId: string) {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(optionPools)
    .where(and(eq(optionPools.companyId, companyId), isNull(optionPools.deletedAt)));
  return result?.count ?? 0;
}
