/**
 * Local-user row primitives — shared by the web app's `ensureLocalUser`/`getLocalOwner`
 * wrappers AND the burnless CLI's `users`/`config` verbs (S5). Singleton `db` (matches
 * every other query). NO capability gate here — the web wrapper applies `autoLogin`.
 */
import { asc, eq } from "drizzle-orm";
import { db } from "../index";
import { companies, companyMembers, users } from "../schema";

/** The placeholder identity for the single local self-host user (pre-claim). */
export const LOCAL_OWNER_EMAIL = "owner@localhost";

/**
 * Well-known, sort-first id for the first-run owner row, so the owner is the
 * deterministic "oldest user" even on a createdAt ms-collision. Survives claim
 * (claim mutates email + passwordHash, never the id).
 */
export const LOCAL_OWNER_ID = "00000000-0000-4000-a000-000000000000";

/**
 * Deterministic id for the install-time placeholder company (self-host). Parallels
 * the claimable owner USER (LOCAL_OWNER_ID): a genuine per-company `companies` row
 * exists from first boot so the encrypted per-company `aiProviders` path works
 * everywhere (CLI/wizard/settings) without a company-creation chicken-and-egg.
 * The onboarding wizard's company step CLAIMS/EDITS this row (non-destructive).
 */
export const LOCAL_OWNER_COMPANY_ID = "00000000-0000-4000-a000-000000000001";

export interface UserSummary {
  id: string;
  email: string;
  name: string | null;
  claimed: boolean;
}

/** Insert the owner iff NO user exists. Idempotent + race-safe. */
export async function createOwnerUserIfNone(): Promise<void> {
  const [existing] = await db.select({ id: users.id }).from(users).limit(1);
  if (existing) return;
  await db
    .insert(users)
    .values({
      id: LOCAL_OWNER_ID,
      email: LOCAL_OWNER_EMAIL,
      name: "Owner",
      emailVerified: new Date(),
      passwordHash: null,
    })
    .onConflictDoNothing({ target: users.email });
}

/**
 * Insert the install-time placeholder company + owner membership iff NO company
 * membership exists anywhere (single-tenant invariant). Idempotent + race-safe via
 * a triple-lock: deterministic id + onConflictDoNothing(id) + the company_member_unique
 * index + this any-membership short-circuit. Both inserts run in one transaction so a
 * crash never leaves a company without a membership. NO capability gate here — the web
 * wrapper / CLI bootstrap apply the self-host (autoLogin) gate.
 */
export async function createOwnerCompanyIfNone(ownerId: string): Promise<void> {
  const [existing] = await db.select({ id: companyMembers.id }).from(companyMembers).limit(1);
  if (existing) return;
  await db.transaction(async (tx) => {
    await tx
      .insert(companies)
      .values({
        id: LOCAL_OWNER_COMPANY_ID,
        name: "My Company",
        ownerId,
      })
      .onConflictDoNothing({ target: companies.id });
    await tx
      .insert(companyMembers)
      .values({
        companyId: LOCAL_OWNER_COMPANY_ID,
        userId: ownerId,
        role: "owner",
      })
      .onConflictDoNothing();
  });
}

/** The auto-login target — deterministically the first-run owner (oldest user). */
export async function getOwnerUser() {
  const [u] = await db
    .select({ id: users.id, email: users.email, name: users.name, image: users.image })
    .from(users)
    .orderBy(asc(users.createdAt), asc(users.id))
    .limit(1);
  return u ?? null;
}

/** True iff the owner row exists AND has a passwordHash (claimed). */
export async function isOwnerClaimed(): Promise<boolean> {
  const [u] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .orderBy(asc(users.createdAt), asc(users.id))
    .limit(1);
  return u != null && u.passwordHash != null;
}

/** List all users with a derived `claimed` flag (passwordHash present). */
export async function listUsers(): Promise<UserSummary[]> {
  const rows = await db
    .select({ id: users.id, email: users.email, name: users.name, passwordHash: users.passwordHash })
    .from(users)
    .orderBy(asc(users.createdAt), asc(users.id));
  return rows.map((r) => ({ id: r.id, email: r.email, name: r.name, claimed: r.passwordHash != null }));
}

/** Create an additional user with a random id. Throws on duplicate email. */
export async function createUser(input: {
  email: string;
  name?: string;
  passwordHash: string;
}): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    email: input.email,
    name: input.name ?? null,
    emailVerified: new Date(),
    passwordHash: input.passwordHash,
  });
  return { id };
}

/** Set (or reset) a user's password by email. Returns rows affected. */
export async function setUserPassword(email: string, passwordHash: string): Promise<number> {
  const updated = await db
    .update(users)
    .set({ passwordHash })
    .where(eq(users.email, email))
    .returning({ id: users.id });
  return updated.length;
}
