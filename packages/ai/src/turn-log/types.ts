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

export type { LlmMessage };
