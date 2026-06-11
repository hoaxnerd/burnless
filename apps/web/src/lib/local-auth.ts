import { db, users } from "@burnless/db";
import { asc } from "drizzle-orm";
import { getCapabilities } from "./capabilities";

/** The placeholder identity for the single local self-host user (pre-claim). */
export const LOCAL_OWNER_EMAIL = "owner@localhost";

/**
 * Well-known, sort-first id for the first-run owner row. Lets `getLocalOwner`
 * deterministically pick the owner even when `createdAt` (truncated to ms by
 * `mode:"date"`) collides with a later-inserted user — an all-zeros UUID always
 * sorts before a random `crypto.randomUUID()`. Survives email/password claim
 * (claim mutates email + passwordHash, never the id).
 */
export const LOCAL_OWNER_ID = "00000000-0000-4000-a000-000000000000";

/**
 * S4a — create the single local user iff `autoLogin` is on AND no user exists.
 * Idempotent + race-safe (unique email + onConflictDoNothing). No-op on cloud.
 * Called at boot (instrumentation) and defensively by /api/auth/auto-login.
 */
export async function ensureLocalUser(): Promise<void> {
  if (!getCapabilities().autoLogin) return;
  const [existing] = await db.select({ id: users.id }).from(users).limit(1);
  if (existing) return; // single-user model: any user → don't create
  await db
    .insert(users)
    .values({
      id: LOCAL_OWNER_ID,
      email: LOCAL_OWNER_EMAIL,
      name: "Owner",
      emailVerified: new Date(), // belt-and-suspenders; verify is cap-gated off anyway
      passwordHash: null, // null ⇒ unclaimed
    })
    .onConflictDoNothing({ target: users.email });
}

/**
 * The auto-login target — deterministically the first-run owner (oldest user).
 * Survives email/password claim (same row) and remains the target even after a
 * future CLI (S5) adds more users. No schema column needed.
 */
export async function getLocalOwner() {
  const [u] = await db
    .select({ id: users.id, email: users.email, name: users.name, image: users.image })
    .from(users)
    // createdAt is the first-run signal; id is the deterministic tiebreaker. The
    // owner's sort-first LOCAL_OWNER_ID guarantees it wins a createdAt ms-collision
    // (mode:"date" truncates to ms) against any later random-UUID user.
    .orderBy(asc(users.createdAt), asc(users.id))
    .limit(1);
  return u ?? null;
}
