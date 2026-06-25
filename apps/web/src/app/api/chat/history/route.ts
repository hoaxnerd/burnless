/**
 * GET /api/chat/history — List conversations and their messages.
 *
 * Query params:
 *   - conversationId: get messages for a specific conversation
 *   - (none): list all conversations for the current user
 */

import { NextResponse } from "next/server";
import { db, getTurnEvents, getOpenGate } from "@burnless/db";
import { aiConversations } from "@burnless/db";
import { eq, and, desc, lt } from "drizzle-orm";
import { categorizeToolName, projectTimeline } from "@burnless/ai";
import type { PermissionCategory, ProjectedMessage, ProjectedNode, TurnEvent } from "@burnless/ai";
import { requireCompanyAccess, withErrorHandler } from "@/lib/api-helpers";
import { describeToolAction, buildDomainToolCategories } from "@/lib/ai-tools";
import { parsePaginationParams, paginatedResponse } from "@/lib/pagination";

/** Raw gate-action shape as persisted on the gate event (chat-stream.ts onPause):
 *  the model's tool_use plus the diff-gate override delta computed at pause-time. */
type RawGateAction = {
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  override?: unknown[];
};

/** Map a raw persisted gate action → the client PermissionAction shape the
 *  permission card renders (tool / category / description / input / override).
 *  This is the SAME mapping the pre-turn-log reader applied to a pending row.
 *  `categories` carries the domain-tool `mutates` map so a restored card shows
 *  the same category icon the live gate did (a domain forget_fact = delete,
 *  not the bare-categorizer's "read" fallback). */
function mapPermissionActions(
  actions: unknown[],
  categories: Record<string, PermissionCategory>,
) {
  return (actions as RawGateAction[]).map((a) => ({
    requestId: a.requestId,
    tool: a.toolName,
    category: categorizeToolName(a.toolName, categories),
    description: describeToolAction(a.toolName, a.toolInput),
    input: a.toolInput,
    // Diff-gate delta persisted at pause-time (worklog Plan 3); null if none.
    override: a.override ?? null,
  }));
}

/** A projected timeline node carries RAW gate actions on permission pause nodes
 *  (projectTimeline defers the client mapping to the caller). Rewrite any
 *  diff_gate node's `pending.actions` into the client PermissionAction shape so
 *  the per-turn timeline renders the card identically to the live SSE path. */
function mapNodeGateActions(
  node: ProjectedNode,
  categories: Record<string, PermissionCategory>,
): ProjectedNode {
  if (node.kind === "diff_gate" && node.pending) {
    return {
      ...node,
      pending: {
        ...node.pending,
        actions: mapPermissionActions(node.pending.actions, categories),
      },
    };
  }
  return node;
}

function mapMessageGateActions(
  message: ProjectedMessage,
  categories: Record<string, PermissionCategory>,
): ProjectedMessage {
  if (!message.timeline) return message;
  return { ...message, timeline: message.timeline.map((n) => mapNodeGateActions(n, categories)) };
}

export const GET = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get("conversationId");

  if (conversationId) {
    // Verify conversation belongs to this company before returning messages
    const [conv] = await db
      .select({ id: aiConversations.id })
      .from(aiConversations)
      .where(
        and(
          eq(aiConversations.id, conversationId),
          eq(aiConversations.companyId, ctx.companyId)
        )
      );

    if (!conv) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    // Project the conversation's render model from the durable turn-event log
    // (Task 3.3). `projectTimeline` groups events per assistant turn — each
    // assistant message carries its OWN `timeline` + `uiBlocks` — and surfaces
    // the single UNRESOLVED gate as `openGate` (the live pending card). The
    // permission-gate `actions` arrive RAW; map them to the client shape below.
    const { messages: projected, openGate } = projectTimeline(
      // TurnEventRow.payload is jsonb (`unknown`); the durable log shape is
      // TurnEvent. Same bridge cast the resume route uses (Task 3.2).
      (await getTurnEvents(conversationId)) as unknown as TurnEvent[]
    );
    // Domain-tool category map (A3b-3) so restored permission cards label a
    // domain write/delete the same as the live gate did. Resolved once and
    // threaded through every gate-action mapping below.
    const { domainRegistry } = await import("@/lib/domains");
    const domainCategories = buildDomainToolCategories(
      await domainRegistry.getActiveTools({ companyId: ctx.companyId }),
    );
    const messages = projected.map((m) => mapMessageGateActions(m, domainCategories));

    // The open gate pauses for one of three reasons (kind): "permission" (a
    // write/tool approval), "input" (a form the model asked the user to fill),
    // or "plan" (an editable plan awaiting approval). Branch on kind to restore
    // the matching card. Permission actions INCLUDE the override diff persisted
    // at pause-time (worklog Plan 3), mapped to the client shape.
    const gatePayload = openGate?.payload as
      | { pauseId: string; actions?: unknown[]; spec?: unknown }
      | undefined;
    const pendingPermission =
      openGate && openGate.kind === "permission"
        ? {
            pauseId: openGate.pauseId,
            conversationId,
            actions: mapPermissionActions(gatePayload?.actions ?? [], domainCategories),
          }
        : null;
    const pendingInput =
      openGate && openGate.kind === "input"
        ? {
            pauseId: openGate.pauseId,
            conversationId,
            spec: gatePayload?.spec,
          }
        : null;
    const pendingPlan =
      openGate && openGate.kind === "plan"
        ? {
            pauseId: openGate.pauseId,
            conversationId,
            spec: gatePayload?.spec,
          }
        : null;

    // Full-run reload (Plan 5): the open gate's full lead-up + live gate nodes
    // rendered as ONE timeline on the last assistant turn — the gate-owning
    // assistant message's projected timeline (with permission actions mapped).
    // The client prefers this over the per-kind pending fields.
    const pendingTimeline = openGate
      ? messages.length > 0
        ? (messages[messages.length - 1]!.timeline ?? null)
        : null
      : null;

    // AI-09: an open gate is only "resumable" (genuinely-just-paused) for a
    // short window. An older gate belongs to a historical conversation the user
    // is merely browsing — the client restores it as inert (resolved) rather
    // than live controls, so a stale gate never locks the composer. The TTL is
    // read off the gate event's own createdAt (projectTimeline does not carry
    // it; fetch the raw gate row only when a gate is open).
    const RESUMABLE_TTL_MS = 30 * 60 * 1000; // 30 minutes
    let resumable = false;
    if (openGate) {
      const gateRow = await getOpenGate(conversationId);
      resumable =
        gateRow?.createdAt != null &&
        Date.now() - new Date(gateRow.createdAt).getTime() < RESUMABLE_TTL_MS;
    }

    return NextResponse.json({
      conversationId,
      messages,
      pendingPermission,
      pendingInput,
      pendingPlan,
      pendingTimeline,
      // AI-09: whether the restored pending gate should render live (true) or
      // inert/resolved (false) on the client.
      resumable,
    });
  }

  // List conversations with cursor-based pagination
  const { limit, cursor } = parsePaginationParams(request);

  const conditions = [
    eq(aiConversations.companyId, ctx.companyId),
    eq(aiConversations.userId, ctx.userId),
  ];

  if (cursor) {
    // Cursor is an ISO timestamp (updatedAt of last item on previous page)
    conditions.push(lt(aiConversations.updatedAt, new Date(cursor)));
  }

  const rows = await db
    .select()
    .from(aiConversations)
    .where(and(...conditions))
    .orderBy(desc(aiConversations.updatedAt))
    .limit(limit + 1);

  return NextResponse.json(paginatedResponse(rows, limit, "updatedAt"));
});
