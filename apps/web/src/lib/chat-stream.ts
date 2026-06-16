// apps/web/src/lib/chat-stream.ts
/**
 * Shared Server-Sent-Events responder for AI chat. Wires the permission
 * resolver, persists paused turns, serializes stream chunks, and saves the
 * final assistant message. Used by POST /api/chat and POST /api/chat/resume.
 */
import { db, createPendingAction, updatePendingActionTimeline, appendTurnEvent } from "@burnless/db";
import { aiConversations, aiMessages } from "@burnless/db";
import { eq } from "drizzle-orm";
import {
  chatStream,
  resolvePermission,
  categorizeToolName,
  isDisplayTool,
  type ChatMessage,
  type PermissionDefaults,
  type PermissionCategory,
  type ToolDefinition,
  type UiBlock,
  type TimelineNode,
  type AiWriteMode,
} from "@burnless/ai";
import { executeToolCall, describeToolAction } from "@/lib/ai-tools";
import { logger } from "@/lib/logger";

export interface ChatStreamParams {
  companyId: string;
  userId: string;
  scenarioId: string;
  /** AI-01: nullable WRITE target. null = base view → tool writes hit base tables.
   *  Distinct from `scenarioId` (read context, persisted for resume's buildAiContext). */
  writeScenarioId: string | null;
  conversationId: string;
  /** Turn id minted by the chat POST route for this turn. Threaded so the
   *  streaming layer can tag its append-as-you-go log events with it (Task 2.2
   *  consumes it; this task only threads it through). */
  turnId: string;
  messages: ChatMessage[];
  financialContext: string;
  companionName: string;
  providerConfig: Parameters<typeof chatStream>[0]["providerConfig"];
  defaults: PermissionDefaults;
  sessionGrants: Record<string, boolean>;
  /** Company AI write mode (spec §4.4). Drives the resolvePermission clamp.
   *  Optional for back-compat; the agentic surface treats absent as "confirm". */
  writeMode?: AiWriteMode;
  /** MCP tools assembled for this turn (assembleMcpTools) — spec §3.4. */
  mcp?: { tools: ToolDefinition[]; categories: Record<string, PermissionCategory> };
  /** Built-in tools the user has disabled for this turn (per-built-in disables +
   *  session-disabled built-ins). Filtered out of the interactive tool set
   *  before the loop (S3b §11). */
  disabledToolNames?: ReadonlySet<string>;
  creditWarning?: string;
}

const THINK_TAG = /<(?:think|thinking|antThinking)[^>]*>[\s\S]*?<\/(?:think|thinking|antThinking)>/gi;

/** Order-independent JSON for dedup signatures (AI-05). */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

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

/** True iff a tool result is a successful exit_scenario (return to base). */
export function scenarioExitFrom(toolName: string, raw: string): boolean {
  if (toolName !== "exit_scenario") return false;
  try {
    const p = JSON.parse(raw) as { success?: boolean; exited?: boolean };
    return p?.success === true && p?.exited === true;
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

      // AI-05: dedup identical DISPLAY-only genui blocks within one turn (the model
      // sometimes emits the same show_* twice). Mutations are never deduped.
      const seenDisplaySignatures = new Set<string>();

      // Diff-gate (spec §4.2): override deltas computed at pause-time, keyed by the
      // tool_use requestId, so the permission_request SSE case can attach them.
      const pendingOverrides = new Map<string, unknown[]>();

      // Ordered worklog nodes (spec §4.5), persisted to metadata.timeline on done.
      // A resumed turn no longer seeds this — the durable turn-event log is the
      // single source for the historical timeline (projectTimeline in the history
      // endpoint); this live `timeline` only accumulates THIS stream segment's nodes.
      const timeline: TimelineNode[] = [];
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

      // A+B (spec §4.1): the turn's active scenario can change mid-turn. Start at the
      // request's write target; create_scenario/activate_scenario move it; exit_scenario
      // resets it to base. Every subsequent tool call reads/writes through it.
      let turnScenarioId: string | null = params.writeScenarioId;

      // Phase 2 dual-write (Task 2.2): the executed `tool_result` event must carry the
      // SAME provider tool_use id that the `assistant_step` persisted in `toolUses[].id`
      // (the projector pairs tool_use↔tool_result by that id). `onToolCall` is only
      // handed `(toolName, input)` — not the id — so we stash the latest assistant
      // step's tool_use refs here and pair each `onToolCall` to its unconsumed ref by
      // name+input. Tools in a batch run in order; consuming refs as we go keeps the
      // pairing 1:1 even when the same tool appears twice. The `assistant_step` chunk
      // arrives and is processed BEFORE its tools execute, so this is populated in time.
      let stepToolUses: { id: string; name: string; input: Record<string, unknown>; consumed: boolean }[] = [];
      const matchToolUseId = (toolName: string, input: Record<string, unknown>): string | undefined => {
        const sig = stableStringify(input);
        const exact = stepToolUses.find((t) => !t.consumed && t.name === toolName && stableStringify(t.input) === sig);
        const hit = exact ?? stepToolUses.find((t) => !t.consumed && t.name === toolName);
        if (hit) hit.consumed = true;
        return hit?.id;
      };

      // Task 2.3 exactly-once dedup: every `tool_result` event appended this turn
      // records its toolUseId here. The executed-append (onToolCall) and the
      // hard-stop `stopped` switch-append both add their id; the pause callbacks
      // then append a tool_result ONLY for `completedResults` blocks whose id is
      // NOT in this set (the synthesized deferred/declined same-batch results,
      // which never pass through onToolCall). Guarantees each tool_use is
      // persisted at most once across onToolCall + pause.
      const appendedResultIds = new Set<string>();

      // Append the not-yet-persisted same-batch tool_result events that accumulated
      // in `completedResults` before a pause, in order, BEFORE the gate event (so the
      // projector pairs EVERY tool_use in the persisted assistant_step). Executed
      // results were already appended in onToolCall (their id is in the set) and are
      // skipped here — exactly-once. Every other block is appended regardless of
      // marker: deferred/declined carry a JSON marker we classify; a soft-STEER block
      // (`{repeated:true}`) carries no such marker but its tool_use STILL needs a
      // paired result, so it falls through to kind "executed" (a completed result the
      // model received). Dropping it would dangle its tool_use → provider 400.
      const appendPausedResults = async (completedResults: unknown[]) => {
        for (const block of completedResults) {
          const b = block as { toolUseId?: string; content?: string };
          if (typeof b.toolUseId !== "string" || appendedResultIds.has(b.toolUseId)) continue;
          let kind: "executed" | "deferred" | "declined" = "executed";
          try {
            const parsed = JSON.parse(b.content ?? "") as { deferred?: boolean; declined?: boolean };
            if (parsed?.deferred) kind = "deferred";
            else if (parsed?.declined) kind = "declined";
          } catch {
            /* non-JSON content → unclassifiable marker → kind stays "executed" */
          }
          appendedResultIds.add(b.toolUseId);
          const ref = stepToolUses.find((t) => t.id === b.toolUseId);
          await appendTurnEvent({
            conversationId: params.conversationId,
            turnId: params.turnId,
            type: "tool_result",
            payload: {
              toolUseId: b.toolUseId,
              toolName: ref?.name ?? "",
              result: b.content ?? "",
              kind,
            },
          });
        }
      };

      const emitScenarioExited = (controller: ReadableStreamDefaultController) => {
        send(controller, { type: "scenario_exited" });
        timeline.push({ id: `scenario-exit-${timeline.length}`, kind: "scenario", scenarioName: null });
      };

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
              dynamicCategories: params.mcp?.categories,
            }),
          extraTools: params.mcp?.tools,
          disabledToolNames: params.disabledToolNames,
          onToolCall: async (toolName, input) => {
            const raw = await executeToolCall(toolName, input, {
              companyId: params.companyId,
              scenarioId: turnScenarioId,
              userId: params.userId,
              conversationId: params.conversationId,
              permissionDecision: "auto",
            });
            // Pair this executed call to the provider tool_use id the assistant_step
            // persisted, so the dual-write tool_result event carries the SAME id space.
            const toolUseId = matchToolUseId(toolName, input);
            const activation = scenarioActivationFrom(toolName, raw);
            if (activation) {
              turnScenarioId = activation.scenarioId;
              emitScenarioActivated(controller, activation);
              await appendTurnEvent({ conversationId: params.conversationId, turnId: params.turnId, type: "scenario", payload: { action: "activated", scenarioId: activation.scenarioId, name: activation.name } });
            } else if (scenarioExitFrom(toolName, raw)) {
              turnScenarioId = null;
              emitScenarioExited(controller);
              await appendTurnEvent({ conversationId: params.conversationId, turnId: params.turnId, type: "scenario", payload: { action: "exited" } });
            }
            // The string handed back to the model (= what this turn's tool_result
            // event records as `result`). Defaults to raw; display tools override it
            // with their terse modelResult below.
            let modelResult = raw;
            let render: { component: string; props: Record<string, unknown>; confidence?: "high" | "low"; rationale?: string } | undefined;
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
                  // The dual-write render mirrors the live ui_component (Task 2.2). It is
                  // recorded even for a deduped block, so a reloaded thread re-renders
                  // the component the model "saw" at this step.
                  render = { component: block.component, props: block.props };
                  if (block.confidence) render.confidence = block.confidence;
                  if (block.rationale) render.rationale = block.rationale;
                  modelResult = typeof parsed.modelResult === "string" ? parsed.modelResult : `[${parsed.render.component} shown]`;
                  const sig = `${parsed.render.component}:${stableStringify(parsed.render.props ?? {})}`;
                  if (seenDisplaySignatures.has(sig)) {
                    // Identical display block already emitted this turn — skip the
                    // duplicate live render but still return the terse modelResult so the
                    // model loop is unaffected (the executed tool_result is still
                    // appended below — the model DID see this result).
                  } else {
                    seenDisplaySignatures.add(sig);
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
                  }
                }
              } catch {
                /* not an envelope — modelResult stays raw */
              }
            }
            // Dual-write the EXECUTED tool_result here — the ONE place where both the
            // model-facing string and the render are known. The hard-stop `stopped`
            // results never reach onToolCall (synthesized in chat.ts) and are appended
            // in the SSE switch; deferred/declined results are Task 2.3 (out of scope).
            const executedId = toolUseId ?? toolName;
            appendedResultIds.add(executedId);
            await appendTurnEvent({
              conversationId: params.conversationId,
              turnId: params.turnId,
              type: "tool_result",
              payload: {
                toolUseId: executedId,
                toolName,
                result: modelResult,
                kind: "executed",
                ...(render ? { render } : {}),
              },
            });
            return modelResult;
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
                // External MCP tools can never produce an override diff, and their
                // dispatch hits the LIVE server regardless of mode — never "preview"
                // one here (it would execute before approval AND again on resume).
                if (action.toolName.startsWith("mcp__")) return action;
                const category = categorizeToolName(action.toolName, params.mcp?.categories);
                if (category !== "write" && category !== "delete") return action;
                try {
                  const raw = await executeToolCall(action.toolName, action.toolInput, {
                    companyId: params.companyId,
                    scenarioId: turnScenarioId,
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
              writeScenarioId: turnScenarioId,
              assistantBlocks: state.assistantBlocks,
              completedResults: state.completedResults,
              pending: enrichedPending,
            });
            // Dual-write (Task 2.3): persist the deferred/declined same-batch
            // results BEFORE the gate (thread pairing), then the UNRESOLVED gate.
            await appendPausedResults(state.completedResults);
            await appendTurnEvent({
              conversationId: params.conversationId,
              turnId: params.turnId,
              type: "gate",
              payload: {
                pauseId,
                kind: "permission",
                actions: enrichedPending,
                scenarioId: params.scenarioId,
                writeScenarioId: turnScenarioId,
              },
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
              writeScenarioId: turnScenarioId,
              assistantBlocks: state.assistantBlocks,
              completedResults: state.completedResults,
              pending: { inputToolUseId: state.inputToolUseId, spec: state.spec },
            });
            // Dual-write (Task 2.3): deferred/declined results BEFORE the gate.
            await appendPausedResults(state.completedResults);
            await appendTurnEvent({
              conversationId: params.conversationId,
              turnId: params.turnId,
              type: "gate",
              payload: {
                pauseId,
                kind: "input",
                spec: state.spec,
                // The gated tool_use id (permission gates use actions[].requestId).
                gatedToolUseId: state.inputToolUseId,
                scenarioId: params.scenarioId,
                writeScenarioId: turnScenarioId,
              },
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
              writeScenarioId: turnScenarioId,
              assistantBlocks: state.assistantBlocks,
              completedResults: state.completedResults,
              pending: { planToolUseId: state.planToolUseId, spec: state.spec },
            });
            // Dual-write (Task 2.3): deferred/declined results BEFORE the gate.
            await appendPausedResults(state.completedResults);
            await appendTurnEvent({
              conversationId: params.conversationId,
              turnId: params.turnId,
              type: "gate",
              payload: {
                pauseId,
                kind: "plan",
                spec: state.spec,
                // The gated tool_use id (permission gates use actions[].requestId).
                gatedToolUseId: state.planToolUseId,
                scenarioId: params.scenarioId,
                writeScenarioId: turnScenarioId,
              },
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
            case "assistant_step": {
              // Dual-write the model thread step (Task 2.2): record the assistant text
              // + the tool_use batch BEFORE its tools run. Seed the pairing list so the
              // upcoming onToolCall executions tag their tool_result events with the
              // SAME tool_use ids persisted here (the projector pairs on these ids).
              stepToolUses = (chunk.toolUses ?? []).map((t) => ({ id: t.id, name: t.name, input: t.input, consumed: false }));
              await appendTurnEvent({
                conversationId: params.conversationId,
                turnId: params.turnId,
                type: "assistant_step",
                payload: {
                  ...(chunk.text ? { text: chunk.text } : {}),
                  ...(chunk.toolUses ? { toolUses: chunk.toolUses } : {}),
                },
              });
              break;
            }
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
              // Dual-write ONLY the hard-stop `stopped` results here (Task 2.2). They are
              // synthesized in chat.ts for every trailing tool_use a convergence-guard
              // never ran, so they never pass through onToolCall — this is their single
              // append point. Executed results were already appended inside onToolCall;
              // deferred/declined are Task 2.3. The chunk's `nodeId` is the provider
              // tool_use id, matching the assistant_step toolUses id space.
              if (chunk.kind === "stopped") {
                const stoppedId = chunk.nodeId ?? chunk.toolName ?? "";
                appendedResultIds.add(stoppedId);
                await appendTurnEvent({
                  conversationId: params.conversationId,
                  turnId: params.turnId,
                  type: "tool_result",
                  payload: {
                    toolUseId: stoppedId,
                    toolName: chunk.toolName ?? "",
                    result: chunk.toolResult ?? "",
                    kind: "stopped",
                  },
                });
              }
              send(controller, { type: "tool_result", tool: chunk.toolName, data: parsed, nodeId: chunk.nodeId, nodeKind: chunk.nodeKind });
              break;
            }
            case "permission_request": {
              const actions = (chunk.actions ?? []).map((a) => ({
                requestId: a.requestId,
                tool: a.toolName,
                category: categorizeToolName(a.toolName, params.mcp?.categories),
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
              // Dual-write: the turn closed cleanly (Task 2.2). Keep the aiMessages
              // insert above (existing behavior) — this just marks the log's terminus.
              await appendTurnEvent({ conversationId: params.conversationId, turnId: params.turnId, type: "turn_done", payload: {} });
              send(controller, { type: "done", conversationId: params.conversationId });
              break;
            }
            case "error":
              // Dual-write: a model-emitted error chunk ends the turn (Task 2.2).
              await appendTurnEvent({ conversationId: params.conversationId, turnId: params.turnId, type: "turn_error", payload: { message: chunk.content ?? "AI error" } });
              send(controller, { type: "error", content: chunk.content ?? "AI error" });
              break;
          }
        }
      } catch (error) {
        // Self-host operators get NO visibility into chat failures otherwise: the
        // error chunk goes to the browser, never to the server log. Log it here
        // (safe identifiers + the error only — never prompt/message bodies).
        logger("chat").error(
          { err: error instanceof Error ? error : undefined, conversationId: params.conversationId },
          "chat stream failed",
        );
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
        // Dual-write the terminal error (Task 2.2). Best-effort: a failing append must
        // not mask the original error or block the client's error frame.
        await appendTurnEvent({
          conversationId: params.conversationId,
          turnId: params.turnId,
          type: "turn_error",
          payload: { message: error instanceof Error ? error.message : "AI error" },
        }).catch(() => {});
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
