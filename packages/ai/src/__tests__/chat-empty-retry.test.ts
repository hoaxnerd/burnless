/**
 * A4 — chat routes through THE seam (resolveResilientProvider) so a transient
 * empty completion is RETRIED by the resilience layer and the turn RECOVERS
 * (no "wasn't able to generate" fallback).
 *
 * We mock only `../providers.createProvider` to hand back a fake raw provider
 * whose stream throws EmptyCompletionError on the first attempt and yields real
 * text on the second. Routing + resilience (the real retry) are left UNMOCKED,
 * proving chat.resolveProvider builds the full resilient stack from a
 * providerConfig and that the retry recovers the empty completion.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EmptyCompletionError } from "../providers/resilience";

let attempt = 0;

function emptyThenText() {
  return (async function* () {
    attempt += 1;
    if (attempt === 1) {
      // Transient empty completion — the raw provider signals it the same way
      // AiSdkProvider does, so resilience treats it as retryable.
      throw new EmptyCompletionError("mock-model");
    }
    yield { type: "text_delta", text: "Your MRR is healthy." };
    yield {
      type: "done",
      response: {
        content: [{ type: "text", text: "Your MRR is healthy." }],
        stopReason: "stop",
        usage: { inputTokens: 10, outputTokens: 5 },
      },
    };
  })();
}

// Mock ONLY createProvider — keep routing + resilience real so the retry runs.
vi.mock("../providers", async (orig) => {
  const actual = await orig<typeof import("../providers")>();
  return {
    ...actual,
    createProvider: () => ({
      modelId: "mock-model",
      complete: vi.fn(),
      stream: () => emptyThenText(),
    }),
  };
});

// NB: resilience runs for real (the whole point of this test). The one retry
// incurs the real exponential backoff (~0.5-1s) — acceptable for a single
// retry. We deliberately do NOT mock DEFAULT_RETRY_CONFIG: ResilientProvider
// reads the module-internal binding, so a re-export override would be a no-op.

const { chatStream } = await import("../chat");

beforeEach(() => {
  attempt = 0;
});

describe("chatStream transient empty completion is retried and recovers", () => {
  it("retries the empty first attempt and yields the real text (no fallback)", async () => {
    const chunks: { type: string; content?: string }[] = [];
    for await (const c of chatStream({
      messages: [{ role: "user", content: "how am I doing" }],
      financialContext: "ctx",
      onToolCall: vi.fn(),
      providerConfig: { provider: "openrouter", apiKey: "sk-x", model: "mock-model" },
    })) {
      chunks.push(c as never);
    }

    expect(attempt).toBeGreaterThanOrEqual(2); // first attempt empty, retried

    const text = chunks
      .filter((c) => c.type === "text")
      .map((c) => c.content)
      .join("");
    expect(text).toBe("Your MRR is healthy.");
    expect(text.toLowerCase()).not.toMatch(/wasn't able|try again/);
    expect(chunks.some((c) => c.type === "done")).toBe(true);
  });
});
