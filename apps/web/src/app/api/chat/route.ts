/**
 * POST /api/chat — Main AI chat endpoint with streaming responses.
 *
 * Accepts a user message + optional conversationId, streams Claude's response
 * back as Server-Sent Events. Handles tool calls server-side.
 */

import { z } from "zod";
import { db } from "@burnless/db";
import { aiConversations, aiMessages, scenarios as scenariosTable } from "@burnless/db";
import { eq, asc } from "drizzle-orm";
import { chatStream, type ChatMessage } from "@burnless/ai";
import { requireCompanyAccess, errorResponse } from "@/lib/api-helpers";
import { executeToolCall } from "@/lib/ai-tool-executor";
import { buildAiContext } from "@/lib/build-ai-context";
import { getDefaultScenario } from "@/lib/data";

const chatSchema = z.object({
  message: z.string().min(1),
  conversationId: z.string().optional(),
  scenarioId: z.string().optional(),
});

export async function POST(request: Request) {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  let body: z.infer<typeof chatSchema>;
  try {
    body = chatSchema.parse(await request.json());
  } catch {
    return errorResponse("Invalid request body", 400);
  }

  // Get or create conversation
  let conversationId = body.conversationId;
  if (!conversationId) {
    const [conv] = await db
      .insert(aiConversations)
      .values({
        companyId: ctx.companyId,
        userId: ctx.userId,
        title: body.message.slice(0, 100),
      })
      .returning();
    conversationId = conv!.id;
  }

  // Save user message
  await db.insert(aiMessages).values({
    conversationId,
    role: "user",
    content: body.message,
  });

  // Load conversation history
  const history = await db
    .select()
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, conversationId))
    .orderBy(asc(aiMessages.createdAt));

  const messages: ChatMessage[] = history
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  // Resolve scenario
  let scenario;
  if (body.scenarioId) {
    const [found] = await db.select().from(scenariosTable).where(eq(scenariosTable.id, body.scenarioId));
    scenario = found ?? await getDefaultScenario(ctx.companyId);
  } else {
    scenario = await getDefaultScenario(ctx.companyId);
  }

  if (!scenario) {
    return errorResponse("No scenario found. Create a scenario first.", 404);
  }

  // Build financial context
  const { contextText } = await buildAiContext(ctx.companyId, {
    id: scenario.id,
    name: scenario.name,
    type: scenario.type,
  });

  // Stream response as SSE
  const encoder = new TextEncoder();
  let fullResponse = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const chunks = chatStream({
          messages,
          financialContext: contextText,
          onToolCall: async (toolName, input) => {
            return executeToolCall(toolName, input, {
              companyId: ctx.companyId,
              scenarioId: scenario.id,
              userId: ctx.userId,
            });
          },
        });

        for await (const chunk of chunks) {
          if (chunk.type === "text" && chunk.content) {
            fullResponse += chunk.content;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "text", content: chunk.content })}\n\n`)
            );
          } else if (chunk.type === "tool_use") {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "tool_use", tool: chunk.toolName })}\n\n`)
            );
          } else if (chunk.type === "tool_result") {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "tool_result", tool: chunk.toolName })}\n\n`)
            );
          } else if (chunk.type === "done") {
            // Save assistant response
            if (fullResponse) {
              await db.insert(aiMessages).values({
                conversationId: conversationId!,
                role: "assistant",
                content: fullResponse,
              });
            }

            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "done", conversationId })}\n\n`)
            );
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "AI error";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", content: message })}\n\n`)
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
