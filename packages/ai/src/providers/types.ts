/**
 * Provider-agnostic types for LLM integration.
 *
 * Every AI provider (Anthropic, OpenAI, OpenRouter, etc.) must map to/from
 * these types. Application code NEVER touches provider-specific SDKs directly.
 */

// ── Messages ────────────────────────────────────────────────────────────────

export type MessageRole = "user" | "assistant" | "system";

export interface TextContent {
  type: "text";
  text: string;
}

export interface ToolUseContent {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultContent {
  type: "tool_result";
  toolUseId: string;
  content: string;
}

export type ContentBlock = TextContent | ToolUseContent | ToolResultContent;

export interface LlmMessage {
  role: MessageRole;
  content: string | ContentBlock[];
}

// ── Tools ───────────────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  /** A2 declarative tool metadata — drives the derived registry sets.
   *  All optional, plain data; the provider bridge (toAiSdkTools) ignores them. */
  flavor?: "display" | "input" | "plan" | "core"; // family; absent = ordinary domain tool
  mutates?: "write" | "delete";                    // absent = read-only
  scenarioTargetable?: boolean;                    // gets scenarioId param + overlay-write targeting
  mcpExcluded?: boolean;                           // hidden from MCP server (non-genui exclusions)
  cacheTags?: string[];                            // revalidateTag targets after a successful mutation (web)
  nonFacade?: boolean;                             // mutation bypasses the scenario-overlay facade (web)
}

// ── Response ────────────────────────────────────────────────────────────────

export type StopReason = "end_turn" | "tool_use" | "max_tokens" | "unknown";

export interface LlmResponse {
  content: ContentBlock[];
  stopReason: StopReason;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

// ── Streaming ───────────────────────────────────────────────────────────────

export interface StreamTextDelta {
  type: "text_delta";
  text: string;
}

export interface StreamThinkingDelta {
  type: "thinking_delta";
  text: string;
}

export interface StreamToolUse {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface StreamDone {
  type: "done";
  response: LlmResponse;
}

export interface StreamError {
  type: "error";
  error: Error;
}

export type StreamEvent = StreamTextDelta | StreamThinkingDelta | StreamToolUse | StreamDone | StreamError;

// ── Model tiers ─────────────────────────────────────────────────────────────

/** Model tier — determines which model class to use for a given task. */
export type ModelTier = "fast" | "standard" | "deep";

// ── Provider config ─────────────────────────────────────────────────────────

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  model: string;
  maxTokens?: number;
  /** Extra provider-specific options (e.g., organization ID for OpenAI) */
  extra?: Record<string, unknown>;
}

// ── Usage tracking ──────────────────────────────────────────────────────────

export interface UsageRecord {
  feature: string;
  tier: ModelTier;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Estimated cost in USD (microdollars for precision) */
  estimatedCostMicros: number;
  durationMs: number;
  timestamp: Date;
}

// ── Request ─────────────────────────────────────────────────────────────────

export interface CompletionRequest {
  messages: LlmMessage[];
  system?: string;
  tools?: ToolDefinition[];
  maxTokens?: number;
}
