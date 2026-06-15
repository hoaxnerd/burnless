import { describe, test, expect } from "vitest";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { AiSdkProvider } from "../ai-sdk-provider";
import { EmptyCompletionError } from "../resilience";
import type { CompletionRequest, StreamEvent } from "../types";

/** Low-level V3 stream part — the wire shape the underlying model emits, which
 *  streamText() converts into the fullStream parts our provider consumes. Typed
 *  loosely here to avoid a direct dependency on @ai-sdk/provider in tests. */
type V3StreamPart = Record<string, unknown> & { type: string };

/**
 * Build an AiSdkProvider whose underlying model streams the given low-level
 * V3 stream parts. streamText() turns these into the fullStream parts our
 * provider consumes — so this exercises the real SDK plumbing, no hand-rolled
 * fakes of our own stream shape.
 */
function providerStreaming(chunks: V3StreamPart[], modelId = "test-model"): AiSdkProvider {
  const model = new MockLanguageModelV3({
    modelId,
    doStream: async () => ({
      stream: simulateReadableStream({ chunks: chunks as never[] }),
    }),
  });
  // Cast: the SDK's LanguageModel union accepts a V3 model instance.
  return new AiSdkProvider(model as never, { apiKey: "", model: modelId, maxTokens: 256 });
}

const REQ: CompletionRequest = {
  messages: [{ role: "user", content: "hi" }],
};

const FINISH: V3StreamPart = {
  type: "finish",
  finishReason: "stop",
  usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
};

async function collect(provider: AiSdkProvider): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const ev of provider.stream(REQ)) events.push(ev);
  return events;
}

describe("AiSdkProvider.stream", () => {
  test("empty stream (no text, no tool-call) throws EmptyCompletionError", async () => {
    const provider = providerStreaming([
      { type: "stream-start", warnings: [] },
      FINISH,
    ], "google/gemini-2.5-flash-lite");

    await expect(collect(provider)).rejects.toBeInstanceOf(EmptyCompletionError);
  });

  test("error part is thrown (not emitted as a done event)", async () => {
    const boom = new Error("kaboom");
    const provider = providerStreaming([
      { type: "stream-start", warnings: [] },
      { type: "error", error: boom },
      FINISH,
    ]);

    const events: StreamEvent[] = [];
    await expect(
      (async () => {
        for await (const ev of provider.stream(REQ)) events.push(ev);
      })()
    ).rejects.toThrow("kaboom");
    // No done event should have been yielded.
    expect(events.some((e) => e.type === "done")).toBe(false);
    // No error event should be surfaced either — errors are thrown now.
    expect(events.some((e) => e.type === "error")).toBe(false);
  });

  test("normal text stream yields text deltas then a final done event", async () => {
    const provider = providerStreaming([
      { type: "stream-start", warnings: [] },
      { type: "text-start", id: "t1" },
      { type: "text-delta", id: "t1", delta: "Hello" },
      { type: "text-delta", id: "t1", delta: " world" },
      { type: "text-end", id: "t1" },
      FINISH,
    ]);

    const events = await collect(provider);
    expect(events.some((e) => e.type === "text_delta")).toBe(true);
    const last = events.at(-1);
    expect(last?.type).toBe("done");
    if (last?.type === "done") {
      const text = last.response.content
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("");
      expect(text).toBe("Hello world");
    }
  });

  test("tool-call stream yields a done event (no throw)", async () => {
    const provider = providerStreaming([
      { type: "stream-start", warnings: [] },
      {
        type: "tool-call",
        toolCallId: "call_1",
        toolName: "get_weather",
        input: JSON.stringify({ city: "Paris" }),
      },
      { type: "finish", finishReason: "tool-calls", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
    ]);

    const events = await collect(provider);
    const last = events.at(-1);
    expect(last?.type).toBe("done");
    if (last?.type === "done") {
      expect(last.response.content.some((b) => b.type === "tool_use")).toBe(true);
    }
  });
});
