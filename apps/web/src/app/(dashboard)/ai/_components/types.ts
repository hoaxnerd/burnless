export interface Message {
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  isStreaming?: boolean;
  toolCalls?: string[];
  /** ms-epoch send time. Absent for restored history turns with no persisted
   *  timestamp — the message list then renders an absolute date, not "just now". */
  createdAt?: number | null;
  /** Live status of a tool currently executing (Plan 3 tool_status event). */
  toolStatus?: { tool: string; phase: "running" | "done" | "error" } | null;
  /** A paused tool batch awaiting the user's decision. */
  pendingPermission?: PendingPermission | null;
  /** Inline rendered display components for this message (genui). */
  uiBlocks?: UiBlockClient[];
  /** A form-input request paused on this message (genui). */
  pendingInput?: PendingInput | null;
  /** A plan-approval request paused on this message (worklog). */
  pendingPlan?: PendingPlan | null;
  /** Ordered worklog nodes for an assistant turn (worklog Plan 4). When present,
   *  the timeline is the render source; the legacy bubble fields are a fallback. */
  timeline?: TimelineNodeClient[];
}

export interface Insight {
  type: string;
  title: string;
  summary: string;
  details: string;
  severity: "info" | "warning" | "critical";
}

export interface Conversation {
  id: string;
  title: string | null;
  updatedAt: string;
}

export type PermissionCategoryId =
  | "read"
  | "write"
  | "delete"
  | "web_search"
  | "browser_use";

/** One per-entity scenario-override delta — the diff-gate before/after payload
 *  (mirrors @burnless/db ScenarioPlan; spec §4.2). */
export interface ScenarioOverrideDelta {
  action: "create" | "modify" | "delete" | "remove_override";
  entityType: string;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export interface PermissionAction {
  requestId: string;
  tool: string;
  category: PermissionCategoryId;
  description: string;
  input: Record<string, unknown>;
  /** Diff-gate delta computed at pause-time (worklog Plan 3); absent for
   *  non-facade mutations and full-mode writes with no diff. */
  override?: ScenarioOverrideDelta[] | null;
}

export interface PendingPermission {
  pauseId: string;
  conversationId: string;
  actions: PermissionAction[];
  /** Set once the user has decided, so the card renders in a resolved state. */
  resolved?: boolean;
}

export type PermissionDecisionKind = "once" | "session" | "deny";

/** A rendered generative-UI display block (mirrors @burnless/ai UiBlock). */
export interface UiBlockClient {
  id: string;
  component: string;
  props: Record<string, unknown>;
  /** Binary confidence + rationale (spec §4.3); absent until Plan 5's prompt. */
  confidence?: "high" | "low";
  rationale?: string;
}

export type TimelineNodeKindClient = "plan" | "tool" | "diff_gate" | "result" | "input" | "scenario";

/** One worklog node on the client (mirrors @burnless/ai TimelineNode). The pause
 *  nodes (plan/diff_gate/input) hold their full payload inline once the SSE pause
 *  event hydrates them — they are not just markers on the client. */
export interface TimelineNodeClient {
  id: string;
  kind: TimelineNodeKindClient;
  // tool
  toolName?: string;
  phase?: "pending" | "running" | "done" | "error";
  /** Permission class of the tool, when known — drives the read/write/delete tag on MCP steps. */
  category?: PermissionCategoryId;
  // result
  text?: string;
  block?: UiBlockClient;
  confidence?: "high" | "low";
  rationale?: string;
  // pause payloads (hydrated from the SSE pause event)
  pending?: PendingPermission;  // diff_gate
  plan?: PendingPlan;           // plan
  input?: PendingInput;         // input
  /** Set once a pause node's gate has been decided. */
  resolved?: boolean;
  // scenario marker (Plan 5)
  scenarioId?: string;
  scenarioName?: string;
}

export interface PendingInputField {
  name: string;
  type: "currency" | "percent" | "number" | "integer" | "text" | "select" | "date" | "date_range";
  label: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  defaultValue?: unknown;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
}

/** A turn paused awaiting form input. */
export interface PendingInput {
  pauseId: string;
  conversationId: string;
  spec: { title: string; description?: string; submitLabel?: string; fields: PendingInputField[] };
  resolved?: boolean;
}

/** A plan step as seen by the client (mirrors @burnless/ai PlanStep). */
export interface PlanStepClient {
  id: string;
  kind: "tool" | "note";
  title: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  rationale?: string;
  confidence?: "high" | "low";
}

export interface PlanSpecClient {
  title: string;
  description?: string;
  steps: PlanStepClient[];
}

/** A turn paused awaiting plan approval. */
export interface PendingPlan {
  pauseId: string;
  conversationId: string;
  spec: PlanSpecClient;
  resolved?: boolean;
}
