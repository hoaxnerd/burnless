import { createOwnerUserIfNone, getOwnerUser, LOCAL_OWNER_EMAIL, LOCAL_OWNER_ID } from "@burnless/db";
import { getCapabilities } from "./capabilities";

export { LOCAL_OWNER_EMAIL, LOCAL_OWNER_ID };

/**
 * S4a — create the single local user iff `autoLogin` is on AND no user exists.
 * Idempotent. No-op on cloud. Called at boot (instrumentation) + defensively by
 * /api/auth/auto-login. The row-insert lives in @burnless/db (shared with the CLI).
 */
export async function ensureLocalUser(): Promise<void> {
  if (!getCapabilities().autoLogin) return;
  await createOwnerUserIfNone();
}

/** The auto-login target — the first-run owner (oldest user). */
export async function getLocalOwner() {
  return getOwnerUser();
}
