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
  isDisplayTool,
  type ChatMessage,
  type PermissionDefaults,
  type UiBlock,
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

/** Cheap shape probe for a display-tool `{ render: { component }, modelResult }` envelope. */
function looksLikeRenderEnvelope(raw: string): boolean {
  if (!raw.includes("\"render\"") || !raw.includes("\"component\"")) return false;
  try {
    const parsed = JSON.parse(raw) as { render?: { component?: unknown } };
    return typeof parsed.render?.component === "string";
  } catch {
    return false;
  }
}

export function buildChatSSEResponse(params: ChatStreamParams): Response {
  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController, obj: unknown) =>
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

  let fullResponse = "";

  const stream = new ReadableStream({
    async start(controller) {
      send(controller, { type: "conversation_id", conversationId: params.conversationId });

      // Display-tool render payloads accumulate here; persisted to
      // aiMessages.metadata.uiBlocks on `done` so reload can re-render (spec §6/§8).
      const uiBlocks: UiBlock[] = [];

      try {
        const chunks = chatStream({
          messages: params.messages,
          financialContext: params.financialContext,
          companionName: params.companionName,
          providerConfig: params.providerConfig,
          resolvePermission: (toolName) =>
            resolvePermission(toolName, { defaults: params.defaults, sessionGrants: params.sessionGrants }),
          onToolCall: async (toolName, input) => {
            const raw = await executeToolCall(toolName, input, {
              companyId: params.companyId,
              scenarioId: params.scenarioId,
              userId: params.userId,
              conversationId: params.conversationId,
              permissionDecision: "auto",
            });
            // Display tool: emit the render payload to the client, return the terse
            // modelResult to the model. A display tool is recognized either by the
            // DISPLAY_TOOL_NAMES membership (the spec's registry, populated in Plan 2)
            // OR by the `{ render, modelResult }` envelope it returns — the two are
            // disjoint from data/permission tools, so detecting the envelope shape is
            // equivalent and forward-compatible while the name set is still empty.
            // Malformed / non-envelope payloads fall through and return raw.
            if (isDisplayTool(toolName) || looksLikeRenderEnvelope(raw)) {
              try {
                const parsed = JSON.parse(raw) as {
                  render?: { component: string; props: Record<string, unknown> };
                  modelResult?: string;
                };
                if (parsed.render?.component) {
                  const id = crypto.randomUUID();
                  const block: UiBlock = { id, component: parsed.render.component, props: parsed.render.props ?? {} };
                  uiBlocks.push(block);
                  send(controller, { type: "ui_component", id, component: block.component, props: block.props, tool: toolName });
                  return typeof parsed.modelResult === "string" ? parsed.modelResult : `[${parsed.render.component} shown]`;
                }
              } catch {
                /* not an envelope — return raw below */
              }
            }
            return raw;
          },
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
          onInputRequest: async (state) => {
            const pauseId = crypto.randomUUID();
            await createPendingAction({
              conversationId: params.conversationId,
              pauseId,
              kind: "input",
              scenarioId: params.scenarioId,
              assistantBlocks: state.assistantBlocks,
              completedResults: state.completedResults,
              pending: { inputToolUseId: state.inputToolUseId, spec: state.spec },
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
            case "input_request":
              send(controller, {
                type: "input_request",
                pauseId: chunk.pauseId,
                conversationId: params.conversationId,
                spec: chunk.spec,
              });
              break;
            case "paused":
              send(controller, { type: "paused", pauseId: chunk.pauseId, conversationId: params.conversationId });
              break;
            case "done": {
              const clean = fullResponse.replace(THINK_TAG, "").trim();
              // Persist when there is text OR rendered display blocks; a
              // display-only turn carries the uiBlocks so reload re-renders (spec §6/§8).
              if (clean || uiBlocks.length > 0) {
                await db.insert(aiMessages).values({
                  conversationId: params.conversationId,
                  role: "assistant",
                  content: clean,
                  metadata: uiBlocks.length > 0 ? { uiBlocks } : null,
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
