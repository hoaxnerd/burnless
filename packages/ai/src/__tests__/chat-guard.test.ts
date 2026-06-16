import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { chatStream } from "../chat";
import type { StreamChunk } from "../types";

// Mock routing to return a fake provider whose stream() ALWAYS asks to call
// create_scenario with identical args. This makes the convergence guard
// accumulate within a single chatStream invocation (same signature each
// iteration) so it trips the soft/hard limits without any pause/resume.
vi.mock("../routing", () => {
  const mockStream = vi.fn();
  const mockComplete = vi.fn();
  const provider = { complete: mockComplete, stream: mockStream, modelId: "mock-model" };
  return {
    getProviderForFeature: vi.fn(() => null),
    resolveResilientProvider: vi.fn(() => provider),
    __mockStream: mockStream,
    __mockComplete: mockComplete,
  };
});

// Keep the tool set non-empty so onToolCall is offered, but its contents are irrelevant.
vi.mock("../tools", () => ({
  getFinancialTools: vi.fn(() => [{ name: "create_scenario", description: "", inputSchema: {} }]),
}));

vi.mock("../sanitize", () => ({
  sanitizeUserMessage: vi.fn((msg: string) => msg),
}));

vi.mock("../prompts", () => ({
  buildSystemMessage: vi.fn((ctx: string) => `System: ${ctx}`),
}));

const routing = await import("../routing");
const mockStream = (routing as unknown as { __mockStream: ReturnType<typeof vi.fn> }).__mockStream;

describe("chatStream convergence guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BURNLESS_AI_REPEAT_SOFT_LIMIT = "2";
    process.env.BURNLESS_AI_REPEAT_HARD_LIMIT = "3";
    // Always ask to call create_scenario with identical args.
    let id = 0;
    mockStream.mockImplementation(() =>
      (async function* () {
        const useId = `cs_${id++}`;
        yield { type: "tool_use", id: useId, name: "create_scenario", input: { name: "X" } };
        yield {
          type: "done",
          response: {
            content: [
              { type: "tool_use", id: useId, name: "create_scenario", input: { name: "X" } },
            ],
            stopReason: "tool_use",
          },
        };
      })()
    );
  });

  afterEach(() => {
    delete process.env.BURNLESS_AI_REPEAT_SOFT_LIMIT;
    delete process.env.BURNLESS_AI_REPEAT_HARD_LIMIT;
  });

  it("hard-stops a same-call loop and bounds executions", async () => {
    const toolCallback = vi.fn().mockResolvedValue("{}");

    const chunks: StreamChunk[] = [];
    for await (const chunk of chatStream({
      messages: [{ role: "user", content: "make a scenario" }],
      financialContext: "",
      onToolCall: toolCallback,
    })) {
      chunks.push(chunk);
    }

    // soft=2, hard=3: attempt #1 executes, #2 steers (no execute), #3 stops.
    // So the create runs exactly once, and is bounded by (hard-1)=2.
    expect(toolCallback.mock.calls.length).toBe(1);
    expect(toolCallback.mock.calls.length).toBeLessThanOrEqual(2);

    const textChunks = chunks.filter((c) => c.type === "text");
    expect(textChunks.some((c) => c.content?.includes("stopped to avoid a loop"))).toBe(true);

    const doneChunks = chunks.filter((c) => c.type === "done");
    expect(doneChunks).toHaveLength(1);
  });
});
