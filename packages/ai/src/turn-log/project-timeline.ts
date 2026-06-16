/** Project the durable turn-event log → the CLIENT render model (spec §4.2/§6/§8).
 *
 *  Produces a `ProjectedMessage[]` grouped PER ASSISTANT TURN — each assistant
 *  message carries its OWN `timeline` (TimelineNodeClient[]) + `uiBlocks`
 *  (UiBlockClient[]) segment, exactly the shape `ChatMessageList` / `page.tsx`
 *  consume today (not one flat conversation-wide timeline).
 *
 *  Grouping: a new assistant message OPENS at each `assistant_step` and
 *  ACCUMULATES nodes/uiBlocks from the FOLLOWING tool_result / scenario events
 *  until the next assistant_step or user_message. Control events (scenario, gate,
 *  turn_*) belong to the CURRENT assistant turn and must NOT terminate grouping
 *  (lesson from projectModelThread: do not let control events split a turn).
 *
 *  Mapping:
 *   - assistant_step.text       → a `result` (text) node
 *   - assistant_step.toolUse[]  → a `tool` node each (phase "done")
 *   - tool_result WITH render   → a `result` node carrying `block` + push block to uiBlocks
 *   - tool_result WITHOUT render → updates its matching tool node's phase
 *                                  (declined/stopped → "error", else "done")
 *   - scenario                  → a `scenario` node (name null when action === "exited")
 *   - gate (unresolved)         → set `openGate` (the single live card)
 *   - gate (resolved)           → a historical pause node (diff_gate/input/plan), resolved
 *   - user_message              → a { role:"user", content } message
 *
 *  The TTL/`resumable` staleness flag is NOT applied here: this projection
 *  surfaces the single UNRESOLVED gate (resolvedAt === null) as `openGate`
 *  unconditionally; the caller (history endpoint, Task 3.3) compares the gate's
 *  createdAt against the resumable TTL to decide whether it renders live or inert.
 */
import { categorizeToolName } from "../permissions";
import type {
  TurnEvent,
  OpenGate,
  ProjectedMessage,
  ProjectedNode,
  ProjectedUiBlock,
} from "./types";

type AssistantStepPayload = { text?: string; toolUses?: { id: string; name: string; input: Record<string, unknown> }[] };
type ToolResultPayload = {
  toolUseId: string;
  toolName: string;
  result: string;
  kind?: "executed" | "deferred" | "declined" | "stopped";
  render?: { component: string; props: Record<string, unknown>; confidence?: "high" | "low"; rationale?: string };
};
type ScenarioPayload = { action: "activated" | "exited"; scenarioId?: string; name?: string };
type GatePayload = { pauseId: string; kind: "permission" | "input" | "plan"; actions?: unknown[]; spec?: unknown; scenarioId: string; writeScenarioId: string | null };

const gateKindToNodeKind = (kind: "permission" | "input" | "plan"): ProjectedNode["kind"] =>
  kind === "permission" ? "diff_gate" : kind; // input → "input", plan → "plan"

export function projectTimeline(events: TurnEvent[]): { messages: ProjectedMessage[]; openGate: OpenGate | null } {
  const messages: ProjectedMessage[] = [];
  let openGate: OpenGate | null = null;
  let current: ProjectedMessage | null = null;

  const ensureAssistant = (): ProjectedMessage => {
    // A tool_result / scenario / gate arriving before any assistant_step (or after
    // a user_message) attaches to a fresh assistant message so its node is not lost.
    if (!current || current.role !== "assistant") {
      current = { role: "assistant", content: "", timeline: [], uiBlocks: [] };
      messages.push(current);
    }
    return current;
  };

  for (const e of [...events].sort((a, b) => a.seq - b.seq)) {
    switch (e.type) {
      case "user_message": {
        const p = e.payload as { text: string };
        current = { role: "user", content: p.text };
        messages.push(current);
        break;
      }
      case "assistant_step": {
        const p = e.payload as AssistantStepPayload;
        const msg: ProjectedMessage = { role: "assistant", content: p.text ?? "", timeline: [], uiBlocks: [] };
        if (p.text) msg.timeline!.push({ id: `${e.id}:text`, kind: "result", text: p.text });
        for (const tu of p.toolUses ?? []) {
          msg.timeline!.push({
            id: tu.id,
            kind: "tool",
            toolName: tu.name,
            phase: "done",
            category: categorizeToolName(tu.name),
          });
        }
        messages.push(msg);
        current = msg;
        break;
      }
      case "tool_result": {
        const p = e.payload as ToolResultPayload;
        const msg = ensureAssistant();
        if (p.render) {
          const block: ProjectedUiBlock = {
            id: e.id,
            component: p.render.component,
            props: p.render.props,
            ...(p.render.confidence ? { confidence: p.render.confidence } : {}),
            ...(p.render.rationale ? { rationale: p.render.rationale } : {}),
          };
          msg.timeline!.push({ id: e.id, kind: "result", block });
          msg.uiBlocks!.push(block);
        } else {
          // No render → terse: reflect the outcome on the matching tool node.
          const node = msg.timeline!.find((n) => n.kind === "tool" && n.id === p.toolUseId);
          const phase: ProjectedNode["phase"] =
            p.kind === "declined" || p.kind === "stopped" ? "error" : "done";
          if (node) node.phase = phase;
        }
        break;
      }
      case "scenario": {
        const p = e.payload as ScenarioPayload;
        const msg = ensureAssistant();
        msg.timeline!.push({
          id: e.id,
          kind: "scenario",
          scenarioId: p.scenarioId,
          scenarioName: p.action === "exited" ? null : (p.name ?? null),
        });
        break;
      }
      case "gate": {
        const p = e.payload as GatePayload;
        const msg = ensureAssistant();
        if (e.resolvedAt === null) {
          // The single live card. Staleness/resumable TTL is the caller's call.
          openGate = { pauseId: p.pauseId, kind: p.kind, payload: e.payload };
        }
        // Hydrate the pause payload inline — a payload-less pause node renders as
        // null in the client (timeline-view.tsx). Mirror chat-stream.ts persist:
        //  permission → pending:{pauseId, conversationId, actions}
        //  input      → input:{pauseId, conversationId, spec}
        //  plan       → plan:{pauseId, conversationId, spec}
        const resolved = e.resolvedAt !== null;
        const node: ProjectedNode = {
          id: p.pauseId,
          kind: gateKindToNodeKind(p.kind),
          resolved,
        };
        if (p.kind === "permission") {
          node.pending = { pauseId: p.pauseId, conversationId: e.conversationId, actions: p.actions ?? [], resolved };
        } else if (p.kind === "input") {
          node.input = { pauseId: p.pauseId, conversationId: e.conversationId, spec: p.spec, resolved };
        } else {
          node.plan = { pauseId: p.pauseId, conversationId: e.conversationId, spec: p.spec, resolved };
        }
        msg.timeline!.push(node);
        break;
      }
      case "turn_done":
      case "turn_error":
        // Control-only: do NOT terminate the current assistant turn's grouping.
        break;
    }
  }

  // Drop empty timeline/uiBlocks arrays so the client's `hasTimeline` / fallback
  // path matches today's behaviour (assistant msgs with no nodes render as text).
  for (const m of messages) {
    if (m.role === "assistant") {
      if (m.timeline && m.timeline.length === 0) delete m.timeline;
      if (m.uiBlocks && m.uiBlocks.length === 0) delete m.uiBlocks;
    }
  }

  return { messages, openGate };
}
