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
import { eq, and, desc, asc } from "drizzle-orm";
import { requireCompanyAccess, errorResponse } from "@/lib/api-helpers";

export async function GET(request: Request) {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get("conversationId");

  if (conversationId) {
    // Get messages for a specific conversation
    const messages = await db
      .select()
      .from(aiMessages)
      .where(eq(aiMessages.conversationId, conversationId))
      .orderBy(asc(aiMessages.createdAt));

    return NextResponse.json({ conversationId, messages });
  }

  // List all conversations
  const conversations = await db
    .select()
    .from(aiConversations)
    .where(
      and(
        eq(aiConversations.companyId, ctx.companyId),
        eq(aiConversations.userId, ctx.userId)
      )
    )
    .orderBy(desc(aiConversations.updatedAt));

  return NextResponse.json(conversations);
}
