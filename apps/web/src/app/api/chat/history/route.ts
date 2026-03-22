/**
 * GET /api/chat/history — List conversations and their messages.
 *
 * Query params:
 *   - conversationId: get messages for a specific conversation
 *   - (none): list all conversations for the current user
 */

import { NextResponse } from "next/server";
import { db } from "@burnless/db";
import { aiConversations, aiMessages } from "@burnless/db";
import { eq, and, desc, asc, lt } from "drizzle-orm";
import { requireCompanyAccess, withErrorHandler } from "@/lib/api-helpers";
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

    const messages = await db
      .select()
      .from(aiMessages)
      .where(eq(aiMessages.conversationId, conversationId))
      .orderBy(asc(aiMessages.createdAt));

    return NextResponse.json({ conversationId, messages });
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
