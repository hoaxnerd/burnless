/** Clear the "allow for session" grants for one conversation. */
import { z } from "zod";
import { NextResponse } from "next/server";
import { db, resetSessionGrants } from "@burnless/db";
import { aiConversations } from "@burnless/db";
import { and, eq } from "drizzle-orm";
import { requireCompanyAccess, errorResponse, withErrorHandler } from "@/lib/api-helpers";

const schema = z.object({ conversationId: z.string().min(1) });

export const POST = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch {
    return errorResponse("Invalid request body", 400);
  }

  const [conv] = await db
    .select({ id: aiConversations.id })
    .from(aiConversations)
    .where(and(eq(aiConversations.id, body.conversationId), eq(aiConversations.companyId, ctx.companyId)));
  if (!conv) return errorResponse("Conversation not found", 404);

  await resetSessionGrants(body.conversationId);
  return NextResponse.json({ ok: true });
});
