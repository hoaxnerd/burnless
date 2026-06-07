/**
 * GET /api/chat/history — List conversations and their messages.
 *
 * Query params:
 *   - conversationId: get messages for a specific conversation
 *   - (none): list all conversations for the current user
 */

import { NextResponse } from "next/server";
import { db, getActivePendingAction } from "@burnless/db";
import { aiConversations, aiMessages } from "@burnless/db";
import { eq, and, desc, asc, lt } from "drizzle-orm";
import { categorizeToolName } from "@burnless/ai";
import { requireCompanyAccess, withErrorHandler } from "@/lib/api-helpers";
import { describeToolAction } from "@/lib/ai-tools";
import { parsePaginationParams, paginatedResponse } from "@/lib/pagination";

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

    const rows = await db
      .select()
      .from(aiMessages)
      .where(eq(aiMessages.conversationId, conversationId))
      .orderBy(asc(aiMessages.createdAt));

    // Rehydrate genui display blocks persisted on `metadata.uiBlocks` so reload
    // re-renders the inline components (spec §6/§8).
    const messages = rows.map((row) => {
      const meta = row.metadata as { uiBlocks?: unknown[]; timeline?: unknown[] } | null;
      const lifted: Record<string, unknown> = { ...row };
      if (meta?.uiBlocks) lifted.uiBlocks = meta.uiBlocks;
      if (meta?.timeline) lifted.timeline = meta.timeline;
      return lifted;
    });

    // Ownership was verified above; surface any persisted pending batch so the
    // client can re-show the right card after a reload. A turn pauses for one of
    // three reasons (kind): "permission" (a write/tool approval), "input" (a form
    // the model asked the user to fill), or "plan" (an editable plan awaiting
    // approval). Branch on kind so reload restores the matching card.
    const pendingRow = await getActivePendingAction(conversationId);
    const pendingPermission =
      pendingRow && pendingRow.kind === "permission"
        ? {
            pauseId: pendingRow.pauseId,
            conversationId,
            actions: (
              pendingRow.pending as {
                requestId: string;
                toolName: string;
                toolInput: Record<string, unknown>;
                override?: unknown[];
              }[]
            ).map((a) => ({
              requestId: a.requestId,
              tool: a.toolName,
              category: categorizeToolName(a.toolName),
              description: describeToolAction(a.toolName, a.toolInput),
              input: a.toolInput,
              // Diff-gate delta persisted at pause-time (worklog Plan 3); null if none.
              override: a.override ?? null,
            })),
          }
        : null;
    const pendingInput =
      pendingRow && pendingRow.kind === "input"
        ? {
            pauseId: pendingRow.pauseId,
            conversationId,
            spec: (pendingRow.pending as { spec: unknown }).spec,
          }
        : null;
    const pendingPlan =
      pendingRow && pendingRow.kind === "plan"
        ? {
            pauseId: pendingRow.pauseId,
            conversationId,
            spec: (pendingRow.pending as { spec: unknown }).spec,
          }
        : null;

    return NextResponse.json({
      conversationId,
      messages,
      pendingPermission,
      pendingInput,
      pendingPlan,
      // Full-run reload (Plan 5): the lead-up + live gate nodes persisted at
      // pause-time; the client prefers this over the per-kind pending fields.
      pendingTimeline: (pendingRow?.timeline as unknown[] | null) ?? null,
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
