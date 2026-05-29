import { and, eq } from "drizzle-orm";
import { db } from "../index";
import { aiPermissionDefaults } from "../schema";

// ── Per-user permission defaults ─────────────────────────────────────────────

export type PermissionModeValue = "ask" | "session" | "always";

export interface PermissionDefaultsPatch {
  readMode?: PermissionModeValue;
  writeMode?: PermissionModeValue;
  deleteMode?: "ask" | "session"; // delete never "always"
  webSearchMode?: PermissionModeValue;
  browserUseMode?: PermissionModeValue;
}

/** Get a user's saved permission defaults for a company, or null if unset. */
export async function getPermissionDefaults(userId: string, companyId: string) {
  const [row] = await db
    .select()
    .from(aiPermissionDefaults)
    .where(
      and(
        eq(aiPermissionDefaults.userId, userId),
        eq(aiPermissionDefaults.companyId, companyId)
      )
    )
    .limit(1);
  return row ?? null;
}

/** Insert or update a user's permission defaults for a company. */
export async function upsertPermissionDefaults(
  userId: string,
  companyId: string,
  patch: PermissionDefaultsPatch
) {
  await db
    .insert(aiPermissionDefaults)
    .values({ userId, companyId, ...patch })
    .onConflictDoUpdate({
      target: [aiPermissionDefaults.userId, aiPermissionDefaults.companyId],
      set: { ...patch, updatedAt: new Date() },
    });
}
