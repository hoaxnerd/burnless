import { describe, it, expect, vi, beforeEach } from "vitest";
import { chat, chatStream } from "../chat";
import type { StreamChunk } from "../types";

// Mock the providers module
vi.mock("../providers", () => {
  const mockComplete = vi.fn();
  const mockStream = vi.fn();
  return {
    getProvider: vi.fn(() => ({
      complete: mockComplete,
      stream: mockStream,
      modelId: "mock-model",
    })),
    createProvider: vi.fn(() => ({
      complete: mockComplete,
      stream: mockStream,
      modelId: "mock-model",
    })),
    LlmProvider: class {},
    __mockComplete: mockComplete,
    __mockStream: mockStream,
  };
});

// Mock routing to return the mocked provider
vi.mock("../routing", () => ({
  getProviderForFeature: vi.fn(() => null),
  resolveResilientProvider: vi.fn(() => null),
}));

// Mock tools
vi.mock("../tools", () => ({
  getFinancialTools: vi.fn(() => []),
}));

// Mock sanitize to pass-through
vi.mock("../sanitize", () => ({
  sanitizeUserMessage: vi.fn((msg: string) => msg),
}));

// Mock prompts
vi.mock("../prompts", () => ({
  buildSystemMessage: vi.fn((ctx: string) => `System: ${ctx}`),
}));

// Access the mock functions
const providers = await import("../providers");
const routing = await import("../routing");
const mockComplete = (providers as unknown as { __mockComplete: ReturnType<typeof vi.fn> }).__mockComplete;
const mockStream = (providers as unknown as { __mockStream: ReturnType<typeof vi.fn> }).__mockStream;

// chat now resolves every provider through the seam. Default it to the mocked
// provider (sharing mockComplete/mockStream) so existing assertions hold; tests
// that need "no provider" override it per-call below.
const mockProvider = { complete: mockComplete, stream: mockStream, modelId: "mock-model" };
vi.mocked(routing.resolveResilientProvider).mockImplementation(() => mockProvider as never);

describe("chat (non-streaming)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns unconfigured message when no provider available", async () => {
    vi.mocked(routing.resolveResilientProvider).mockReturnValueOnce(null);

    const result = await chat({
      messages: [{ role: "user", content: "Hello" }],
      financialContext: "test context",
    });

    expect(result.response).toContain("AI is not configured");
    expect(result.toolResults).toEqual([]);
  });

  it("returns text response from provider", async () => {
    mockComplete.mockResolvedValueOnce({
      content: [{ type: "text", text: "Your burn rate is $50k/mo" }],
      stopReason: "end_turn",
      usage: { inputTokens: 100, outputTokens: 50 },
    });

    const result = await chat({
      messages: [{ role: "user", content: "What is my burn rate?" }],
      financialContext: "test context",
    });

    expect(result.response).toBe("Your burn rate is $50k/mo");
    expect(result.toolResults).toEqual([]);
  });

  it("concatenates multiple text blocks", async () => {
    mockComplete.mockResolvedValueOnce({
      content: [
        { type: "text", text: "Part 1. " },
        { type: "text", text: "Part 2." },
      ],
      stopReason: "end_turn",
    });

    const result = await chat({
      messages: [{ role: "user", content: "test" }],
      financialContext: "",
    });

    expect(result.response).toBe("Part 1. Part 2.");
  });

  it("handles tool calls in a loop", async () => {
    // First call triggers tool use
    mockComplete.mockResolvedValueOnce({
      content: [
        { type: "tool_use", id: "tool_1", name: "suggest_cost_cuts", input: { threshold: 1000 } },
      ],
      stopReason: "tool_use",
    });
    // Second call returns text after tool result
    mockComplete.mockResolvedValueOnce({
      content: [{ type: "text", text: "I found 3 cost reduction opportunities." }],
      stopReason: "end_turn",
    });

    const toolCallback = vi.fn().mockResolvedValue('{"cuts": []}');

    const result = await chat({
      messages: [{ role: "user", content: "Suggest cost cuts" }],
      financialContext: "",
      onToolCall: toolCallback,
    });

    expect(toolCallback).toHaveBeenCalledWith("suggest_cost_cuts", { threshold: 1000 });
    expect(result.response).toBe("I found 3 cost reduction opportunities.");
    expect(result.toolResults).toHaveLength(1);
    expect(result.toolResults[0]).toEqual({
      tool: "suggest_cost_cuts",
      input: { threshold: 1000 },
      result: '{"cuts": []}',
    });
  });

  it("caps tool iterations at the configured limit", async () => {
    // Pin the cap so the test is deterministic regardless of the env default.
    const prev = process.env.BURNLESS_AI_MAX_TOOL_ITERATIONS;
    process.env.BURNLESS_AI_MAX_TOOL_ITERATIONS = "10";
    try {
      // Every call triggers another tool use — simulate runaway loop
      mockComplete.mockImplementation(async () => ({
        content: [
          { type: "tool_use", id: `tool_${Date.now()}`, name: "suggest_cost_cuts", input: {} },
        ],
        stopReason: "tool_use",
      }));

      const toolCallback = vi.fn().mockResolvedValue("{}");

      const result = await chat({
        messages: [{ role: "user", content: "loop forever" }],
        financialContext: "",
        onToolCall: toolCallback,
      });

      // Should stop after the configured number of iterations, not infinite
      expect(toolCallback).toHaveBeenCalledTimes(10);
      expect(result.response).toContain("maximum number of tool steps");
    } finally {
      if (prev === undefined) delete process.env.BURNLESS_AI_MAX_TOOL_ITERATIONS;
      else process.env.BURNLESS_AI_MAX_TOOL_ITERATIONS = prev;
    }
  });

  it("uses explicit provider config when provided", async () => {
    mockComplete.mockResolvedValueOnce({
      content: [{ type: "text", text: "ok" }],
      stopReason: "end_turn",
    });

    await chat({
      messages: [{ role: "user", content: "test" }],
      financialContext: "",
      providerConfig: {
        provider: "openai",
        apiKey: "sk-test",
        model: "gpt-4o",
      },
    });

    // chat now routes every provider through THE seam, forwarding the config
    // untouched (the seam owns how it's interpreted / which provider is built).
    expect(routing.resolveResilientProvider).toHaveBeenCalledWith("chat", {
      provider: "openai",
      apiKey: "sk-test",
      model: "gpt-4o",
    });
  });

  it("uses a keyless (ollama) provider config instead of the env fallback", async () => {
    // Regression: resolveProvider used to guard on `providerConfig?.apiKey`, so
    // a keyless ollama config (apiKey undefined) was silently discarded and the
    // env fallback was used. The seam must receive the config whenever present;
    // honouring keyless configs is now the seam's responsibility.
    mockComplete.mockResolvedValueOnce({
      content: [{ type: "text", text: "ok" }],
      stopReason: "end_turn",
    });

    await chat({
      messages: [{ role: "user", content: "test" }],
      financialContext: "",
      providerConfig: {
        provider: "ollama",
        baseUrl: "http://localhost:11434/v1",
        model: "llama3",
      },
    });

    expect(routing.resolveResilientProvider).toHaveBeenCalledWith("chat", {
      provider: "ollama",
      baseUrl: "http://localhost:11434/v1",
      model: "llama3",
    });
    // The legacy env-fallback entry points must NOT be consulted from chat.
    expect(routing.getProviderForFeature).not.toHaveBeenCalled();
    expect(providers.getProvider).not.toHaveBeenCalled();
  });
});

describe("chatStream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("yields unconfigured message when no provider", async () => {
    vi.mocked(routing.resolveResilientProvider).mockReturnValueOnce(null);

    const chunks: StreamChunk[] = [];
    for await (const chunk of chatStream({
      messages: [{ role: "user", content: "Hello" }],
      financialContext: "",
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual({ type: "text", content: expect.stringContaining("not configured") });
    expect(chunks[1]).toEqual({ type: "done" });
  });

  it("yields text deltas from streaming provider", async () => {
    mockStream.mockReturnValueOnce(
      (async function* () {
        yield { type: "text_delta", text: "Hello " };
        yield { type: "text_delta", text: "world" };
        yield {
          type: "done",
          response: {
            content: [{ type: "text", text: "Hello world" }],
            stopReason: "end_turn",
          },
        };
      })()
    );

    const chunks: StreamChunk[] = [];
    for await (const chunk of chatStream({
      messages: [{ role: "user", content: "Hi" }],
      financialContext: "",
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toEqual({ type: "text", content: "Hello " });
    expect(chunks[1]).toEqual({ type: "text", content: "world" });
    expect(chunks[2]).toEqual({ type: "done" });
  });

  it("handles tool use during streaming", async () => {
    // First stream: tool use
    mockStream.mockReturnValueOnce(
      (async function* () {
        yield { type: "tool_use", id: "t1", name: "forecast_revenue", input: { months: 6 } };
        yield {
          type: "done",
          response: {
            content: [
              { type: "tool_use", id: "t1", name: "forecast_revenue", input: { months: 6 } },
            ],
            stopReason: "tool_use",
          },
        };
      })()
    );
    // Second stream: final text
    mockStream.mockReturnValueOnce(
      (async function* () {
        yield { type: "text_delta", text: "Revenue forecast ready." };
        yield {
          type: "done",
          response: {
            content: [{ type: "text", text: "Revenue forecast ready." }],
            stopReason: "end_turn",
          },
        };
      })()
    );

    const toolCallback = vi.fn().mockResolvedValue('{"forecast": []}');

    const chunks: StreamChunk[] = [];
    for await (const chunk of chatStream({
      messages: [{ role: "user", content: "Forecast revenue" }],
      financialContext: "",
      onToolCall: toolCallback,
    })) {
      chunks.push(chunk);
    }

    expect(toolCallback).toHaveBeenCalledWith("forecast_revenue", { months: 6 });
    const toolResultChunks = chunks.filter((c) => c.type === "tool_result");
    expect(toolResultChunks).toHaveLength(1);
    const textChunks = chunks.filter((c) => c.type === "text");
    expect(textChunks.length).toBeGreaterThanOrEqual(1);
  });

  it("caps tool iterations at the configured limit during streaming", async () => {
    // Pin the cap so the test is deterministic regardless of the env default.
    const prev = process.env.BURNLESS_AI_MAX_TOOL_ITERATIONS;
    process.env.BURNLESS_AI_MAX_TOOL_ITERATIONS = "10";
    try {
      // Every stream triggers another tool use
      mockStream.mockImplementation(() =>
        (async function* () {
          yield { type: "tool_use", id: "t_loop", name: "suggest_cost_cuts", input: {} };
          yield {
            type: "done",
            response: {
              content: [
                { type: "tool_use", id: "t_loop", name: "suggest_cost_cuts", input: {} },
              ],
              stopReason: "tool_use",
            },
          };
        })()
      );

      const toolCallback = vi.fn().mockResolvedValue("{}");

      const chunks: StreamChunk[] = [];
      for await (const chunk of chatStream({
        messages: [{ role: "user", content: "loop forever" }],
        financialContext: "",
        onToolCall: toolCallback,
      })) {
        chunks.push(chunk);
      }

      // Should stop after the configured number of iterations, not infinite
      expect(toolCallback).toHaveBeenCalledTimes(10);
      const doneChunks = chunks.filter((c) => c.type === "done");
      expect(doneChunks).toHaveLength(1);
      const textChunks = chunks.filter((c) => c.type === "text");
      expect(textChunks.some((c) => c.content?.includes("maximum number of tool steps"))).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.BURNLESS_AI_MAX_TOOL_ITERATIONS;
      else process.env.BURNLESS_AI_MAX_TOOL_ITERATIONS = prev;
    }
  });
});
