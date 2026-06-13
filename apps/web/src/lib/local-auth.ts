import {
  createOwnerCompanyIfNone,
  createOwnerUserIfNone,
  getOwnerUser,
  LOCAL_OWNER_COMPANY_ID,
  LOCAL_OWNER_EMAIL,
  LOCAL_OWNER_ID,
} from "@burnless/db";
import { getCapabilities } from "./capabilities";

export { LOCAL_OWNER_COMPANY_ID, LOCAL_OWNER_EMAIL, LOCAL_OWNER_ID };

/**
 * S4a — create the single local user iff `autoLogin` is on AND no user exists.
 * Idempotent. No-op on cloud. Called at boot (instrumentation) + defensively by
 * /api/auth/auto-login. The row-insert lives in @burnless/db (shared with the CLI).
 */
export async function ensureLocalUser(): Promise<void> {
  if (!getCapabilities().autoLogin) return;
  await createOwnerUserIfNone();
}

/**
 * First-run: create a claimable install company + owner membership iff `autoLogin`
 * is on (self-host) AND an owner user exists. Mirrors {@link ensureLocalUser} —
 * the row-insert primitive lives in @burnless/db (shared with the CLI bootstrap).
 *
 * Why a company exists from boot: per-company config (AI providers) writes encrypted
 * rows keyed by companyId, so a real `companies` row must exist before the wizard's
 * AI-config step. The onboarding wizard later CLAIMS/EDITS this placeholder rather
 * than creating a fresh company. No-op on cloud (cloud creates companies at signup).
 * Idempotent + non-fatal across restarts/races (deterministic id + onConflictDoNothing
 * + membership unique index + any-membership short-circuit in the primitive).
 */
export async function ensureLocalCompany(): Promise<void> {
  if (!getCapabilities().autoLogin) return;
  const owner = await getOwnerUser();
  if (!owner) return;
  await createOwnerCompanyIfNone(owner.id);
}

/** The auto-login target — the first-run owner (oldest user). */
export async function getLocalOwner() {
  return getOwnerUser();
}
