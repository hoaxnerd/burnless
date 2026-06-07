// apps/web/src/lib/chat-stream.ts
/**
 * Shared Server-Sent-Events responder for AI chat. Wires the permission
 * resolver, persists paused turns, serializes stream chunks, and saves the
 * final assistant message. Used by POST /api/chat and POST /api/chat/resume.
 */
import { db, createPendingAction, updatePendingActionTimeline } from "@burnless/db";
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
  type TimelineNode,
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
  /** Worklog timeline accumulated before a pause, seeded so the resumed turn's
   *  `done` persists the FULL run (Plan 5 full-run persistence). */
  seedTimeline?: TimelineNode[];
  /** Scenarios the AI created/activated during the resumed Apply — emitted at
   *  stream start so the client enters them (Plan 5 scenario activation). */
  activatedScenarios?: { scenarioId: string; name: string }[];
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

/** If a tool result represents a scenario the AI created or activated, return its
 *  id+name so the stream can emit `scenario_activated` (Plan 5). Else null. */
export function scenarioActivationFrom(
  toolName: string,
  raw: string
): { scenarioId: string; name: string } | null {
  if (toolName !== "create_scenario" && toolName !== "activate_scenario") return null;
  try {
    const p = JSON.parse(raw) as { success?: boolean; scenarioId?: string; name?: string };
    if (p?.success && typeof p.scenarioId === "string") {
      return { scenarioId: p.scenarioId, name: typeof p.name === "string" ? p.name : "Scenario" };
    }
  } catch {
    /* non-JSON */
  }
  return null;
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

      // Ordered worklog nodes (spec §4.5), persisted to metadata.timeline on done.
      const timeline: TimelineNode[] = params.seedTimeline ? [...params.seedTimeline] : [];
      const findNode = (id: string) => timeline.find((n) => n.id === id);
      // Append/extend the trailing text-result node for streamed prose.
      const appendText = (content: string) => {
        const last = timeline[timeline.length - 1];
        if (last && last.kind === "result" && last.block === undefined) {
          last.text = (last.text ?? "") + content;
        } else {
          timeline.push({ id: `text-${timeline.length}`, kind: "result", text: content });
        }
      };

      // Emit a scenario activation to the client AND record a persisted marker node
      // (Plan 5). The client runs enterScenario on the event; the node persists so
      // reload shows "Activated scenario X" with an Enter affordance.
      const emitScenarioActivated = (
        controller: ReadableStreamDefaultController,
        a: { scenarioId: string; name: string }
      ) => {
        send(controller, { type: "scenario_activated", scenarioId: a.scenarioId, name: a.name });
        timeline.push({ id: `scenario-${a.scenarioId}-${timeline.length}`, kind: "scenario", scenarioId: a.scenarioId, scenarioName: a.name });
      };

      // Re-enter scenarios created/activated during a resumed Apply (Plan 5).
      for (const a of params.activatedScenarios ?? []) emitScenarioActivated(controller, a);

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
            const activation = scenarioActivationFrom(toolName, raw);
            if (activation) emitScenarioActivated(controller, activation);
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
                  // Binary confidence + rationale (spec §4.3). The envelope is built
                  // server-side and rarely carries them, so fall back to the model's
                  // tool INPUT (Plan 5 prompt convention) — this lights the chip.
                  const inp = input as Record<string, unknown>;
                  const inConf = inp.confidence === "high" || inp.confidence === "low" ? inp.confidence : undefined;
                  const inRat = typeof inp.rationale === "string" ? inp.rationale : undefined;
                  const confidence = parsed.confidence === "high" || parsed.confidence === "low" ? parsed.confidence : inConf;
                  const rationale = typeof parsed.rationale === "string" ? parsed.rationale : inRat;
                  if (confidence === "high" || confidence === "low") block.confidence = confidence;
                  if (typeof rationale === "string") block.rationale = rationale;
                  uiBlocks.push(block);
                  timeline.push({ id, kind: "result", block, confidence: block.confidence, rationale: block.rationale });
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
                appendText(chunk.content);
                send(controller, { type: "text", content: chunk.content });
              }
              break;
            case "thinking":
              if (chunk.content) send(controller, { type: "thinking", content: chunk.content });
              break;
            case "tool_use":
              if (chunk.nodeId) timeline.push({ id: chunk.nodeId, kind: "tool", toolName: chunk.toolName, phase: "pending" });
              send(controller, { type: "tool_use", tool: chunk.toolName, nodeId: chunk.nodeId, nodeKind: chunk.nodeKind });
              break;
            case "tool_status": {
              const n = chunk.nodeId ? findNode(chunk.nodeId) : undefined;
              if (n) n.phase = chunk.phase;
              send(controller, { type: "tool_status", tool: chunk.toolName, phase: chunk.phase, nodeId: chunk.nodeId, nodeKind: chunk.nodeKind });
              break;
            }
            case "tool_result": {
              let parsed: unknown = null;
              try {
                parsed = chunk.toolResult ? JSON.parse(chunk.toolResult) : null;
              } catch {
                /* non-JSON, skip */
              }
              send(controller, { type: "tool_result", tool: chunk.toolName, data: parsed, nodeId: chunk.nodeId, nodeKind: chunk.nodeKind });
              break;
            }
            case "permission_request": {
              const actions = (chunk.actions ?? []).map((a) => ({
                requestId: a.requestId,
                tool: a.toolName,
                category: categorizeToolName(a.toolName),
                description: describeToolAction(a.toolName, a.toolInput),
                input: a.toolInput,
                // Diff-gate delta (spec §4.2); null for non-facade mutations.
                override: pendingOverrides.get(a.requestId) ?? null,
              }));
              if (chunk.pauseId) {
                // Rich gate node (Plan 5): carries the full payload so a reloaded /
                // resumed run reconstructs the diff-gate without the live pending row.
                timeline.push({
                  id: chunk.pauseId, kind: "diff_gate",
                  pending: { pauseId: chunk.pauseId, conversationId: params.conversationId, actions },
                });
              }
              send(controller, {
                type: "permission_request",
                pauseId: chunk.pauseId,
                conversationId: params.conversationId,
                actions,
              });
              break;
            }
            case "input_request":
              if (chunk.pauseId) {
                timeline.push({
                  id: chunk.pauseId, kind: "input",
                  input: { pauseId: chunk.pauseId, conversationId: params.conversationId, spec: chunk.spec! },
                });
              }
              send(controller, {
                type: "input_request",
                pauseId: chunk.pauseId,
                conversationId: params.conversationId,
                spec: chunk.spec,
              });
              break;
            case "plan_request":
              if (chunk.pauseId) {
                timeline.push({
                  id: chunk.pauseId, kind: "plan",
                  plan: { pauseId: chunk.pauseId, conversationId: params.conversationId, spec: chunk.plan! },
                });
              }
              send(controller, {
                type: "plan_request",
                pauseId: chunk.pauseId,
                conversationId: params.conversationId,
                plan: chunk.plan,
              });
              break;
            case "paused":
              // Full-run persistence (Plan 5): the lead-up nodes + the rich gate node
              // are now in `timeline`; stash them on the pending row so reload shows
              // the lead-up and the resumed turn can seed them into its final `done`.
              if (chunk.pauseId) await updatePendingActionTimeline(chunk.pauseId, timeline);
              send(controller, { type: "paused", pauseId: chunk.pauseId, conversationId: params.conversationId });
              break;
            case "done": {
              const clean = fullResponse.replace(THINK_TAG, "").trim();
              // Persist when there is text OR rendered display blocks OR worklog nodes;
              // a display-only or worklog turn carries metadata so reload re-renders
              // (spec §6/§8 uiBlocks + §4.5 timeline).
              if (clean || uiBlocks.length > 0 || timeline.length > 0) {
                await db.insert(aiMessages).values({
                  conversationId: params.conversationId,
                  role: "assistant",
                  content: clean,
                  metadata: (uiBlocks.length > 0 || timeline.length > 0) ? { uiBlocks, timeline } : null,
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
