/** Durable chat-turn event log types (single source of truth). See spec §4.2. */
import type { LlmMessage } from "../providers";

export type TurnEventType =
  | "user_message" | "assistant_step" | "tool_result"
  | "scenario" | "gate" | "turn_done" | "turn_error";

/** A tool_use as the model emitted it. */
export interface ToolUseRef { id: string; name: string; input: Record<string, unknown>; }

export type TurnEventPayload =
  | { text: string }                                                   // user_message
  | { text?: string; toolUses?: ToolUseRef[] }                         // assistant_step
  | { toolUseId: string; toolName: string; result: string;            // tool_result
      kind?: "executed" | "deferred" | "declined" | "stopped";
      render?: { component: string; props: Record<string, unknown>; confidence?: "high" | "low"; rationale?: string } }
  | { action: "activated" | "exited"; scenarioId?: string; name?: string } // scenario
  | { pauseId: string; kind: "permission" | "input" | "plan";          // gate
      actions?: unknown[]; spec?: unknown; scenarioId: string; writeScenarioId: string | null }
  | Record<string, never>                                              // turn_done
  | { message: string };                                               // turn_error

export interface TurnEvent {
  id: string;
  conversationId: string;
  seq: number;
  turnId: string;
  type: TurnEventType;
  payload: TurnEventPayload;
  resolvedAt: Date | null;
  createdAt: Date;
}

/** The single open gate surfaced to the client as the live pending card. */
export interface OpenGate { pauseId: string; kind: "permission" | "input" | "plan"; payload: TurnEventPayload; }

// ---------------------------------------------------------------------------
// Client render model (mirrors apps/web .../ai/_components/types.ts). These
// shapes are STRUCTURALLY IDENTICAL to the client's Message / TimelineNodeClient
// / UiBlockClient so the projection feeds the existing renderers unchanged. We
// re-declare them here (rather than import from apps/web) to keep @burnless/ai
// free of an app import; the field names / `kind` literals must stay in lock-step.
// ---------------------------------------------------------------------------

/** A rendered generative-UI display block (mirrors client UiBlockClient). */
export interface ProjectedUiBlock {
  id: string;
  component: string;
  props: Record<string, unknown>;
  confidence?: "high" | "low";
  rationale?: string;
}

/** Permission category (mirrors client PermissionCategoryId). */
export type ProjectedCategory = "read" | "write" | "delete" | "web_search" | "browser_use";

/** A paused tool batch awaiting decision (mirrors client PendingPermission). */
export interface ProjectedPendingPermission {
  pauseId: string;
  conversationId: string;
  actions: unknown[];
  resolved?: boolean;
}

/** A turn paused awaiting form input (mirrors client PendingInput). */
export interface ProjectedPendingInput {
  pauseId: string;
  conversationId: string;
  spec: unknown;
  resolved?: boolean;
}

/** A turn paused awaiting plan approval (mirrors client PendingPlan). */
export interface ProjectedPendingPlan {
  pauseId: string;
  conversationId: string;
  spec: unknown;
  resolved?: boolean;
}

export type ProjectedNodeKind = "plan" | "tool" | "diff_gate" | "result" | "input" | "scenario";

/** One worklog node (mirrors client TimelineNodeClient). Pause nodes
 *  (diff_gate / input / plan) carry their full payload inline so the client
 *  renderer reconstructs the card — a payload-less pause node renders as null. */
export interface ProjectedNode {
  id: string;
  kind: ProjectedNodeKind;
  // tool
  toolName?: string;
  phase?: "pending" | "running" | "done" | "error";
  category?: ProjectedCategory;
  // result
  text?: string;
  block?: ProjectedUiBlock;
  confidence?: "high" | "low";
  rationale?: string;
  // pause payloads (hydrated from the gate event — mirror chat-stream.ts persist)
  pending?: ProjectedPendingPermission; // diff_gate
  plan?: ProjectedPendingPlan;          // plan
  input?: ProjectedPendingInput;        // input
  /** Set once a pause node's gate has been decided. */
  resolved?: boolean;
  // scenario marker
  scenarioId?: string;
  scenarioName?: string | null;
}

/** A projected chat message (mirrors the client Message's render fields). */
export interface ProjectedMessage {
  role: "user" | "assistant";
  content: string;
  timeline?: ProjectedNode[];
  uiBlocks?: ProjectedUiBlock[];
}

/** Result of projecting the durable log into the client render model. */
export interface ProjectedTimeline {
  messages: ProjectedMessage[];
  /** The single unresolved gate (resolvedAt === null), or null. The TTL /
   *  `resumable` staleness decision is the CALLER's job (history endpoint). */
  openGate: OpenGate | null;
}

export type { LlmMessage };
