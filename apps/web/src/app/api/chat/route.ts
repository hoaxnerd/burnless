/**
 * POST /api/chat — Main AI chat endpoint with streaming responses.
 *
 * Accepts a user message + optional conversationId, streams Claude's response
 * back as Server-Sent Events. Handles tool calls server-side.
 */

import { z } from "zod";
import { db } from "@burnless/db";
import { aiConversations, aiMessages, scenarios as scenariosTable } from "@burnless/db";
import { eq, and, asc, gte } from "drizzle-orm";
import { chatStream, type ChatMessage } from "@burnless/ai";
import { requireCompanyAccess, getCompanyPlan, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { canPerformAction } from "@/lib/feature-gate";
import { checkAiFeatureAllowed, getCompanyProviderConfig } from "@/lib/ai-feature-flags";
import { executeToolCall } from "@/lib/ai-tools";
import { buildAiContext } from "@/lib/build-ai-context";
import { getDefaultScenario } from "@/lib/data";
import { initAiUsageTracking } from "@/lib/ai-usage-tracker";

const chatSchema = z.object({
  message: z.string().min(1),
  conversationId: z.string().nullable().optional(),
  scenarioId: z.string().nullable().optional(),
});

export const POST = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  // Initialize cost tracking (idempotent — runs once)
  initAiUsageTracking(() => ctx.companyId);

  let body: z.infer<typeof chatSchema>;
  try {
    body = chatSchema.parse(await request.json());
  } catch {
    return errorResponse("Invalid request body", 400);
  }

  // Feature gate: check AI feature flags (master switch + chat toggle + data mode + budget)
  const aiCheck = await checkAiFeatureAllowed(ctx.companyId, "chat");
  if (!aiCheck.allowed) {
    return errorResponse(aiCheck.reason!, 403);
  }
  const budgetWarning = aiCheck.budgetStatus?.warning;
  const writeMode = aiCheck.writeMode ?? "full";

  // Feature gate: check AI message limit
  const plan = await getCompanyPlan(ctx.companyId);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthlyMessages = await db
    .select()
    .from(aiMessages)
    .innerJoin(
      aiConversations,
      eq(aiMessages.conversationId, aiConversations.id)
    )
    .where(
      and(
        eq(aiConversations.companyId, ctx.companyId),
        eq(aiMessages.role, "user"),
        gte(aiMessages.createdAt, monthStart)
      )
    );
  const gate = canPerformAction(plan, "ai_message", monthlyMessages.length);
  if (!gate.allowed) {
    return errorResponse(gate.reason!, 403);
  }

  // Get or create conversation
  let conversationId = body.conversationId;
  if (conversationId) {
    // Verify conversation belongs to this company
    const [existing] = await db
      .select({ id: aiConversations.id })
      .from(aiConversations)
      .where(
        and(
          eq(aiConversations.id, conversationId),
          eq(aiConversations.companyId, ctx.companyId)
        )
      );
    if (!existing) {
      return errorResponse("Conversation not found", 404);
    }
  } else {
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
    const [found] = await db.select().from(scenariosTable).where(
      and(eq(scenariosTable.id, body.scenarioId), eq(scenariosTable.companyId, ctx.companyId))
    );
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

  // Load company's custom AI provider config (if any)
  const providerConfig = await getCompanyProviderConfig(ctx.companyId);

  // Stream response as SSE
  const encoder = new TextEncoder();
  let fullResponse = "";

  const stream = new ReadableStream({
    async start(controller) {
      // Send conversationId immediately so client can track it even if stream fails
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "conversation_id", conversationId })}\n\n`)
      );

      try {
        const chunks = chatStream({
          messages,
          financialContext: contextText,
          providerConfig,
          onToolCall: async (toolName, input) => {
            return executeToolCall(toolName, input, {
              companyId: ctx.companyId,
              scenarioId: scenario.id,
              userId: ctx.userId,
              conversationId: conversationId!,
              writeMode,
            });
          },
        });

        for await (const chunk of chunks) {
          if (chunk.type === "text" && chunk.content) {
            fullResponse += chunk.content;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "text", content: chunk.content })}\n\n`)
            );
          } else if (chunk.type === "thinking" && chunk.content) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "thinking", content: chunk.content })}\n\n`)
            );
          } else if (chunk.type === "tool_use") {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "tool_use", tool: chunk.toolName })}\n\n`)
            );
          } else if (chunk.type === "tool_result") {
            // Send tool result data for inline visualizations
            let parsedResult: Record<string, unknown> | null = null;
            try {
              parsedResult = chunk.toolResult ? JSON.parse(chunk.toolResult) : null;
            } catch {
              // non-JSON result, skip
            }
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "tool_result", tool: chunk.toolName, data: parsedResult })}\n\n`)
            );
          } else if (chunk.type === "done") {
            // Strip any leaked thinking tags (defense for non-Anthropic providers)
            const cleanResponse = fullResponse
              .replace(/<(?:think|thinking|antThinking)[^>]*>[\s\S]*?<\/(?:think|thinking|antThinking)>/gi, "")
              .trim();

            // Save assistant response and update conversation timestamp
            if (cleanResponse) {
              await db.insert(aiMessages).values({
                conversationId: conversationId!,
                role: "assistant",
                content: cleanResponse,
              });
              await db
                .update(aiConversations)
                .set({ updatedAt: new Date() })
                .where(eq(aiConversations.id, conversationId!));
            }

            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "done", conversationId })}\n\n`)
            );
          }
        }
      } catch (error) {
        // Save partial response on error so history isn't lost
        if (fullResponse) {
          const cleanPartial = fullResponse
            .replace(/<(?:think|thinking|antThinking)[^>]*>[\s\S]*?<\/(?:think|thinking|antThinking)>/gi, "")
            .trim();
          if (cleanPartial) {
            await db.insert(aiMessages).values({
              conversationId: conversationId!,
              role: "assistant",
              content: cleanPartial,
            }).catch(() => {}); // best-effort
            await db
              .update(aiConversations)
              .set({ updatedAt: new Date() })
              .where(eq(aiConversations.id, conversationId!))
              .catch(() => {});
          }
        }
        const message = error instanceof Error ? error.message : "AI error";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", content: message })}\n\n`)
        );
      } finally {
        controller.close();
      }
    },
  });

  const headers: Record<string, string> = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  };
  if (budgetWarning && aiCheck.budgetStatus) {
    headers["X-AI-Budget-Warning"] = `${aiCheck.budgetStatus.percentUsed}% of monthly budget used`;
  }

  return new Response(stream, { headers });
});
