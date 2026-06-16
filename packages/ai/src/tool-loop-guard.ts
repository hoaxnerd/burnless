/**
 * Two-tier convergence guard (spec §4b). Stops a tool loop where the model emits
 * the SAME tool call (identical args) repeatedly — verified create↔delete
 * oscillation, conv 1c14730f. Counting is per TURN (since the last user text
 * message) and is SEEDED from the conversation history so it survives the
 * pause/resume cycles the diff-gate creates (a per-invocation counter never
 * trips — see spec §1a). Distinct calls never accumulate, so legitimate repeats
 * (e.g. many record_transaction with different args) are unaffected.
 */
import type { LlmMessage, ContentBlock } from "./providers";

export interface GuardLimits {
  soft: number;
  hard: number;
}

export type GuardDecision =
  | { action: "execute" }
  | { action: "steer"; message: string }
  | { action: "stop"; message: string };

/** Order-insensitive signature for a tool call (matches chat-stream's stableStringify). */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

export function toolSignature(name: string, input: unknown): string {
  return `${name}:${stableStringify(input)}`;
}

/** Seed the per-turn count map from history: tally assistant tool_use signatures
 *  AFTER the last user TEXT message (role:"user" with string content). Tool-result
 *  messages (role:"user" with array content) are NOT turn boundaries. */
export function seedSignatureCounts(messages: LlmMessage[]): Map<string, number> {
  let start = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role === "user" && typeof m.content === "string") {
      start = i + 1;
      break;
    }
  }
  const counts = new Map<string, number>();
  for (let i = start; i < messages.length; i++) {
    const m = messages[i]!;
    if (m.role !== "assistant" || !Array.isArray(m.content)) continue;
    for (const block of m.content as ContentBlock[]) {
      if (block.type === "tool_use") {
        const sig = toolSignature(block.name, block.input);
        counts.set(sig, (counts.get(sig) ?? 0) + 1);
      }
    }
  }
  return counts;
}

/** Increment the signature's count (including this attempt) and decide. */
export function checkGuard(
  counts: Map<string, number>,
  name: string,
  input: unknown,
  limits: GuardLimits,
): GuardDecision {
  const sig = toolSignature(name, input);
  const n = (counts.get(sig) ?? 0) + 1;
  counts.set(sig, n);
  if (n >= limits.hard) {
    return {
      action: "stop",
      message:
        "I seem to be repeating the same action without making progress, so I've stopped to avoid a loop. Tell me how you'd like to proceed.",
    };
  }
  if (n >= limits.soft) {
    return {
      action: "steer",
      message: JSON.stringify({
        repeated: true,
        message: `You have already called "${name}" with these exact arguments ${n} times in this turn. Stop repeating it — take a different step, or give the user your final answer / ask a clarifying question.`,
      }),
    };
  }
  return { action: "execute" };
}
