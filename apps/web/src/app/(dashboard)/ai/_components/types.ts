export interface Message {
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  isStreaming?: boolean;
  toolCalls?: string[];
  createdAt: number;
  /** Live status of a tool currently executing (Plan 3 tool_status event). */
  toolStatus?: { tool: string; phase: "running" | "done" | "error" } | null;
  /** A paused tool batch awaiting the user's decision. */
  pendingPermission?: PendingPermission | null;
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

export interface PermissionAction {
  requestId: string;
  tool: string;
  category: PermissionCategoryId;
  description: string;
  input: Record<string, unknown>;
}

export interface PendingPermission {
  pauseId: string;
  conversationId: string;
  actions: PermissionAction[];
  /** Set once the user has decided, so the card renders in a resolved state. */
  resolved?: boolean;
}

export type PermissionDecisionKind = "once" | "session" | "deny";
