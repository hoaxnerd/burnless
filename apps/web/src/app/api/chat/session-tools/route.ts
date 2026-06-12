/**
 * PATCH /api/chat/session-tools — toggle one tool on/off for the current
 * conversation only (S3b Task 5). The per-conversation session-disabled map
 * mirrors the `sessionGrants` split: a session-scoped override that is cleared
 * by `/api/chat/reset-grants`. Permanent disables live in user preferences.
 *
 * CSRF + rate-limit (mutation tier) are handled by the global middleware
 * (this route is under the `/api/chat/*` group).
 */
import { z } from "zod";
import { NextResponse } from "next/server";
import {
  db,
  aiConversations,
  setSessionDisabledTool,
  getSessionDisabledTools,
} from "@burnless/db";
import { and, eq } from "drizzle-orm";
import { requireCompanyAccess, errorResponse, withErrorHandler } from "@/lib/api-helpers";

const schema = z.object({
  conversationId: z.string().uuid(),
  key: z.string().max(200),
  disabled: z.boolean(),
});

export const PATCH = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch {
    return errorResponse("Invalid request body", 400);
  }

  // Ownership: the conversation must belong to the caller's company.
  const [conv] = await db
    .select({ id: aiConversations.id })
    .from(aiConversations)
    .where(and(eq(aiConversations.id, body.conversationId), eq(aiConversations.companyId, ctx.companyId)));
  if (!conv) return errorResponse("Conversation not found", 404);

  await setSessionDisabledTool(body.conversationId, body.key, body.disabled);
  return NextResponse.json(await getSessionDisabledTools(body.conversationId));
});
