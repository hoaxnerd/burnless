// apps/web/src/lib/chat-stream.ts
/**
 * Shared Server-Sent-Events responder for AI chat. Wires the permission
 * resolver, persists paused turns, serializes stream chunks, and saves the
 * final assistant message. Used by POST /api/chat and POST /api/chat/resume.
 */
import { db, createPendingAction } from "@burnless/db";
import { aiConversations, aiMessages } from "@burnless/db";
import { eq } from "drizzle-orm";
import {
  chatStream,
  resolvePermission,
  categorizeToolName,
  type ChatMessage,
  type PermissionDefaults,
} from "@burnless/ai";
import { executeToolCall, describeToolAction } from "@/lib/ai-tools";

export interface ChatStreamParams {
  companyId: string;
  userId: string;
  scenarioId: string;
  conversationId: string;
  messages: ChatMessage[];
  financialContext: string;
  companionName: string;
  providerConfig: Parameters<typeof chatStream>[0]["providerConfig"];
  defaults: PermissionDefaults;
  sessionGrants: Record<string, boolean>;
  creditWarning?: string;
}

const THINK_TAG = /<(?:think|thinking|antThinking)[^>]*>[\s\S]*?<\/(?:think|thinking|antThinking)>/gi;

export function buildChatSSEResponse(params: ChatStreamParams): Response {
  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController, obj: unknown) =>
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

  let fullResponse = "";

  const stream = new ReadableStream({
    async start(controller) {
      send(controller, { type: "conversation_id", conversationId: params.conversationId });

      try {
        const chunks = chatStream({
          messages: params.messages,
          financialContext: params.financialContext,
          companionName: params.companionName,
          providerConfig: params.providerConfig,
          resolvePermission: (toolName) =>
            resolvePermission(toolName, { defaults: params.defaults, sessionGrants: params.sessionGrants }),
          onToolCall: async (toolName, input) =>
            executeToolCall(toolName, input, {
              companyId: params.companyId,
              scenarioId: params.scenarioId,
              userId: params.userId,
              conversationId: params.conversationId,
              permissionDecision: "auto",
            }),
          onPause: async (state) => {
            const pauseId = crypto.randomUUID();
            await createPendingAction({
              conversationId: params.conversationId,
              pauseId,
              scenarioId: params.scenarioId, // persist active scenario for correct resume targeting
              assistantBlocks: state.assistantBlocks,
              completedResults: state.completedResults,
              pending: state.pending,
            });
            return pauseId;
          },
        });

        for await (const chunk of chunks) {
          switch (chunk.type) {
            case "text":
              if (chunk.content) {
                fullResponse += chunk.content;
                send(controller, { type: "text", content: chunk.content });
              }
              break;
            case "thinking":
              if (chunk.content) send(controller, { type: "thinking", content: chunk.content });
              break;
            case "tool_use":
              send(controller, { type: "tool_use", tool: chunk.toolName });
              break;
            case "tool_status":
              send(controller, { type: "tool_status", tool: chunk.toolName, phase: chunk.phase });
              break;
            case "tool_result": {
              let parsed: unknown = null;
              try {
                parsed = chunk.toolResult ? JSON.parse(chunk.toolResult) : null;
              } catch {
                /* non-JSON, skip */
              }
              send(controller, { type: "tool_result", tool: chunk.toolName, data: parsed });
              break;
            }
            case "permission_request":
              send(controller, {
                type: "permission_request",
                pauseId: chunk.pauseId,
                conversationId: params.conversationId,
                actions: (chunk.actions ?? []).map((a) => ({
                  requestId: a.requestId,
                  tool: a.toolName,
                  category: categorizeToolName(a.toolName),
                  description: describeToolAction(a.toolName, a.toolInput),
                  input: a.toolInput,
                })),
              });
              break;
            case "paused":
              send(controller, { type: "paused", pauseId: chunk.pauseId, conversationId: params.conversationId });
              break;
            case "done": {
              const clean = fullResponse.replace(THINK_TAG, "").trim();
              if (clean) {
                await db.insert(aiMessages).values({
                  conversationId: params.conversationId,
                  role: "assistant",
                  content: clean,
                });
                await db
                  .update(aiConversations)
                  .set({ updatedAt: new Date() })
                  .where(eq(aiConversations.id, params.conversationId));
              }
              send(controller, { type: "done", conversationId: params.conversationId });
              break;
            }
            case "error":
              send(controller, { type: "error", content: chunk.content ?? "AI error" });
              break;
          }
        }
      } catch (error) {
        const clean = fullResponse.replace(THINK_TAG, "").trim();
        if (clean) {
          await db
            .insert(aiMessages)
            .values({ conversationId: params.conversationId, role: "assistant", content: clean })
            .catch(() => {});
          await db
            .update(aiConversations)
            .set({ updatedAt: new Date() })
            .where(eq(aiConversations.id, params.conversationId))
            .catch(() => {});
        }
        send(controller, { type: "error", content: error instanceof Error ? error.message : "AI error" });
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
  if (params.creditWarning) headers["X-AI-Credit-Warning"] = params.creditWarning;

  return new Response(stream, { headers });
}
