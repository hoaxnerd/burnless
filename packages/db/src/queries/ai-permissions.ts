import { and, eq, isNull } from "drizzle-orm";
import { db } from "../index";
import {
  aiPermissionDefaults,
  aiConversations,
  aiPendingActions,
} from "../schema";

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

// ── Conversation session grants ──────────────────────────────────────────────

/** Read the session-grant map for a conversation ({} if none). */
export async function getSessionGrants(
  conversationId: string
): Promise<Record<string, boolean>> {
  const [row] = await db
    .select({ grants: aiConversations.sessionGrants })
    .from(aiConversations)
    .where(eq(aiConversations.id, conversationId))
    .limit(1);
  return row?.grants ?? {};
}

/** Grant a category "for session" — merges into the existing map. */
export async function grantSessionPermission(
  conversationId: string,
  category: string
): Promise<void> {
  const current = await getSessionGrants(conversationId);
  const next = { ...current, [category]: true };
  await db
    .update(aiConversations)
    .set({ sessionGrants: next })
    .where(eq(aiConversations.id, conversationId));
}

/** Clear all session grants for a conversation. */
export async function resetSessionGrants(conversationId: string): Promise<void> {
  await db
    .update(aiConversations)
    .set({ sessionGrants: {} })
    .where(eq(aiConversations.id, conversationId));
}

// ── Pending actions (paused turns) ───────────────────────────────────────────

export interface NewPendingAction {
  conversationId: string;
  pauseId: string;
  /** Why the turn paused. Defaults to "permission". */
  kind?: "permission" | "input" | "plan";
  /** Active scenario the paused turn operates in (resume executes against this). */
  scenarioId: string;
  assistantBlocks: unknown;
  completedResults: unknown;
  pending: unknown;
}

/**
 * Persist a paused assistant turn. Throws (unique-violation) if the conversation
 * already has an unresolved pending batch — the single-active invariant.
 */
export async function createPendingAction(input: NewPendingAction) {
  const [row] = await db
    .insert(aiPendingActions)
    .values({
      conversationId: input.conversationId,
      pauseId: input.pauseId,
      kind: input.kind ?? "permission",
      scenarioId: input.scenarioId,
      assistantBlocks: input.assistantBlocks,
      completedResults: input.completedResults,
      pending: input.pending,
    })
    .returning();
  return row!;
}

/** Get the conversation's current unresolved pending batch, or null. */
export async function getActivePendingAction(conversationId: string) {
  const [row] = await db
    .select()
    .from(aiPendingActions)
    .where(
      and(
        eq(aiPendingActions.conversationId, conversationId),
        isNull(aiPendingActions.resolvedAt)
      )
    )
    .limit(1);
  return row ?? null;
}

/** Mark a pending batch resolved (frees the single-active slot). */
export async function resolvePendingAction(id: string): Promise<void> {
  await db
    .update(aiPendingActions)
    .set({ resolvedAt: new Date() })
    .where(eq(aiPendingActions.id, id));
}
