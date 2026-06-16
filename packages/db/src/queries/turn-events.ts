import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../index";
import { aiTurnEvents } from "../schema";

/**
 * Drizzle-inferred row type. We intentionally do NOT import `TurnEvent` from
 * `@burnless/ai` here: `@burnless/db` does not depend on `@burnless/ai`, and
 * adding that edge would risk a circular workspace dependency. The web layer
 * (which depends on both packages) casts these rows to `TurnEvent` before
 * handing them to the `@burnless/ai` projectors.
 */
export type TurnEventRow = typeof aiTurnEvents.$inferSelect;

export interface NewTurnEvent {
  conversationId: string;
  turnId: string;
  type:
    | "user_message"
    | "assistant_step"
    | "tool_result"
    | "scenario"
    | "gate"
    | "turn_done"
    | "turn_error";
  payload: unknown;
  resolvedAt?: Date | null;
}

/**
 * Append one event, assigning `seq = MAX(seq)+1` atomically in a single INSERT.
 * Retries on the `(conversationId, seq)` unique collision — the concurrent
 * resume + new-message race (Postgres-only; PGlite is single-connection so the
 * subselect+insert never interleaves). The retry is intentionally broad: any
 * insert error is retried up to 5 attempts, since the only expected transient
 * failure here is the seq collision and detecting the exact Postgres unique
 * code across drivers is more brittle than a bounded retry.
 */
export async function appendTurnEvent(e: NewTurnEvent): Promise<TurnEventRow> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [row] = await db
        .insert(aiTurnEvents)
        .values({
          conversationId: e.conversationId,
          turnId: e.turnId,
          type: e.type,
          payload: e.payload as object,
          resolvedAt: e.resolvedAt ?? null,
          seq: sql`(SELECT COALESCE(MAX(${aiTurnEvents.seq}), 0) + 1 FROM ${aiTurnEvents} WHERE ${aiTurnEvents.conversationId} = ${e.conversationId})`,
        })
        .returning();
      return row!;
    } catch (err) {
      if (attempt === 4) throw err; // exhausted retries
      // else: unique(conversationId, seq) collision under concurrency → retry
    }
  }
  throw new Error("unreachable");
}

/** All events for a conversation, ordered by monotonic seq. */
export async function getTurnEvents(
  conversationId: string
): Promise<TurnEventRow[]> {
  return db
    .select()
    .from(aiTurnEvents)
    .where(eq(aiTurnEvents.conversationId, conversationId))
    .orderBy(asc(aiTurnEvents.seq));
}

/** The conversation's single open (unresolved) gate event, or null. */
export async function getOpenGate(
  conversationId: string
): Promise<TurnEventRow | null> {
  const [row] = await db
    .select()
    .from(aiTurnEvents)
    .where(
      and(
        eq(aiTurnEvents.conversationId, conversationId),
        eq(aiTurnEvents.type, "gate"),
        isNull(aiTurnEvents.resolvedAt)
      )
    )
    .limit(1);
  return row ?? null;
}

/** Mark the conversation's open gate resolved (frees the single-open slot). */
export async function resolveOpenGate(conversationId: string): Promise<void> {
  await db
    .update(aiTurnEvents)
    .set({ resolvedAt: new Date() })
    .where(
      and(
        eq(aiTurnEvents.conversationId, conversationId),
        eq(aiTurnEvents.type, "gate"),
        isNull(aiTurnEvents.resolvedAt)
      )
    );
}
