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
  type AiWriteMode,
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
  /** Company AI write mode (spec §4.4). Drives the resolvePermission clamp.
   *  Optional for back-compat; the agentic surface treats absent as "confirm". */
  writeMode?: AiWriteMode;
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

      // Diff-gate (spec §4.2): override deltas computed at pause-time, keyed by the
      // tool_use requestId, so the permission_request SSE case can attach them.
      const pendingOverrides = new Map<string, unknown[]>();

      try {
        const chunks = chatStream({
          messages: params.messages,
          financialContext: params.financialContext,
          companionName: params.companionName,
          providerConfig: params.providerConfig,
          // NOTE: two unrelated "writeMode"s converge here. `defaults.write` is the
          // per-USER permission-category default (PermissionMode ask/session/always).
          // `params.writeMode` is the per-COMPANY AiWriteMode clamp (full/confirm/
          // read_only). They are distinct types with distinct sources — do not merge.
          resolvePermission: (toolName) =>
            resolvePermission(toolName, {
              defaults: params.defaults,
              sessionGrants: params.sessionGrants,
              writeMode: params.writeMode ?? "confirm",
            }),
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
                  confidence?: "high" | "low";
                  rationale?: string;
                };
                if (parsed.render?.component) {
                  const id = crypto.randomUUID();
                  const block: UiBlock = { id, component: parsed.render.component, props: parsed.render.props ?? {} };
                  // Binary confidence + rationale (spec §4.3); absent until Plan 5's prompt.
                  if (parsed.confidence === "high" || parsed.confidence === "low") block.confidence = parsed.confidence;
                  if (typeof parsed.rationale === "string") block.rationale = parsed.rationale;
                  uiBlocks.push(block);
                  send(controller, {
                    type: "ui_component",
                    id,
                    component: block.component,
                    props: block.props,
                    tool: toolName,
                    confidence: block.confidence,
                    rationale: block.rationale,
                  });
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
            // Diff-gate enrichment (spec §4.2): for each write/delete awaiting
            // approval, compute its scenario-override delta WITHOUT writing
            // (executeToolCall mode:"plan") and attach it so the client renders the
            // before/after diff. Non-facade mutations (scenario CRUD, investor)
            // return empty overrides from plan mode → no diff → plain card. A failed
            // delta computation pauses without a diff (still safe).
            const enrichedPending = await Promise.all(
              state.pending.map(async (action) => {
                const category = categorizeToolName(action.toolName);
                if (category !== "write" && category !== "delete") return action;
                try {
                  const raw = await executeToolCall(action.toolName, action.toolInput, {
                    companyId: params.companyId,
                    scenarioId: params.scenarioId,
                    userId: params.userId,
                    conversationId: params.conversationId,
                    mode: "plan",
                    permissionDecision: "auto",
                  });
                  const parsed = JSON.parse(raw) as { planned?: boolean; overrides?: unknown[] };
                  if (parsed?.planned && Array.isArray(parsed.overrides) && parsed.overrides.length > 0) {
                    pendingOverrides.set(action.requestId, parsed.overrides);
                    return { ...action, override: parsed.overrides };
                  }
                } catch {
                  /* delta computation failed — pause without a diff */
                }
                return action;
              }),
            );
            await createPendingAction({
              conversationId: params.conversationId,
              pauseId,
              scenarioId: params.scenarioId, // persist active scenario for correct resume targeting
              assistantBlocks: state.assistantBlocks,
              completedResults: state.completedResults,
              pending: enrichedPending,
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
          onPlanRequest: async (state) => {
            const pauseId = crypto.randomUUID();
            await createPendingAction({
              conversationId: params.conversationId,
              pauseId,
              kind: "plan",
              scenarioId: params.scenarioId,
              assistantBlocks: state.assistantBlocks,
              completedResults: state.completedResults,
              pending: { planToolUseId: state.planToolUseId, spec: state.spec },
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
                  // Diff-gate delta (spec §4.2); null for non-facade mutations.
                  override: pendingOverrides.get(a.requestId) ?? null,
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
            case "plan_request":
              send(controller, {
                type: "plan_request",
                pauseId: chunk.pauseId,
                conversationId: params.conversationId,
                plan: chunk.plan,
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
