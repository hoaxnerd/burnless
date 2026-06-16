import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { chatStream } from "../chat";
import type { StreamChunk } from "../types";

// Fake provider whose stream() is driven per-test. Mirrors chat-guard.test.ts.
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

vi.mock("../tools", () => ({
  getFinancialTools: vi.fn(() => [{ name: "record_transaction", description: "", inputSchema: {} }]),
}));

vi.mock("../sanitize", () => ({
  sanitizeUserMessage: vi.fn((msg: string) => msg),
}));

vi.mock("../prompts", () => ({
  buildSystemMessage: vi.fn((ctx: string) => `System: ${ctx}`),
}));

const routing = await import("../routing");
const mockStream = (routing as unknown as { __mockStream: ReturnType<typeof vi.fn> }).__mockStream;

describe("chatStream assistant_step + hard-stop stopped tool_results", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.BURNLESS_AI_REPEAT_SOFT_LIMIT;
    delete process.env.BURNLESS_AI_REPEAT_HARD_LIMIT;
  });

  it("(a) emits an assistant_step carrying text + toolUse BEFORE the tool's tool_result", async () => {
    // Round 1: assistant says some text + asks to call record_transaction.
    // Round 2: assistant gives a final text answer (no tools) → terminal.
    let round = 0;
    mockStream.mockImplementation(() =>
      (async function* () {
        round++;
        if (round === 1) {
          yield { type: "text_delta", text: "Let me record that." };
          yield { type: "tool_use", id: "tu_1", name: "record_transaction", input: { amount: 10 } };
          yield {
            type: "done",
            response: {
              content: [
                { type: "text", text: "Let me record that." },
                { type: "tool_use", id: "tu_1", name: "record_transaction", input: { amount: 10 } },
              ],
              stopReason: "tool_use",
            },
          };
        } else {
          yield { type: "text_delta", text: "Done." };
          yield {
            type: "done",
            response: { content: [{ type: "text", text: "Done." }], stopReason: "end_turn" },
          };
        }
      })()
    );

    const toolCallback = vi.fn().mockResolvedValue("{}");
    const chunks: StreamChunk[] = [];
    for await (const chunk of chatStream({
      messages: [{ role: "user", content: "record 10" }],
      financialContext: "",
      onToolCall: toolCallback,
    })) {
      chunks.push(chunk);
    }

    const stepIdx = chunks.findIndex((c) => c.type === "assistant_step");
    expect(stepIdx).toBeGreaterThanOrEqual(0);
    const step = chunks[stepIdx]!;
    expect(step.text).toBe("Let me record that.");
    expect(step.toolUses).toEqual([{ id: "tu_1", name: "record_transaction", input: { amount: 10 } }]);

    const resultIdx = chunks.findIndex(
      (c) => c.type === "tool_result" && c.nodeId === "tu_1"
    );
    expect(resultIdx).toBeGreaterThanOrEqual(0);
    // assistant_step must come BEFORE the tool executes (its tool_result).
    expect(stepIdx).toBeLessThan(resultIdx);
  });

  it("(b) on a hard-stop, emits assistant_step + stopped tool_result for every batch tool_use before done", async () => {
    process.env.BURNLESS_AI_REPEAT_SOFT_LIMIT = "1";
    process.env.BURNLESS_AI_REPEAT_HARD_LIMIT = "1";

    // soft=hard=1 → the FIRST tool_use in the batch hard-stops immediately. The
    // batch carries a SECOND, distinct tool_use that therefore never runs; both
    // must still receive a `stopped` tool_result (no dangling tool_use).
    mockStream.mockImplementation(() =>
      (async function* () {
        yield { type: "tool_use", id: "cs_0", name: "create_scenario", input: { name: "X" } };
        yield { type: "tool_use", id: "cs_1", name: "create_scenario", input: { name: "Y" } };
        yield {
          type: "done",
          response: {
            content: [
              { type: "text", text: "Working on it." },
              { type: "tool_use", id: "cs_0", name: "create_scenario", input: { name: "X" } },
              { type: "tool_use", id: "cs_1", name: "create_scenario", input: { name: "Y" } },
            ],
            stopReason: "tool_use",
          },
        };
      })()
    );

    const toolCallback = vi.fn().mockResolvedValue("{}");
    const chunks: StreamChunk[] = [];
    for await (const chunk of chatStream({
      messages: [{ role: "user", content: "make a scenario" }],
      financialContext: "",
      onToolCall: toolCallback,
    })) {
      chunks.push(chunk);
    }

    const doneIdx = chunks.findIndex((c) => c.type === "done");
    expect(doneIdx).toBeGreaterThanOrEqual(0);

    // An assistant_step for the stopping response, emitted before done.
    const stepIdx = chunks.findIndex((c) => c.type === "assistant_step");
    expect(stepIdx).toBeGreaterThanOrEqual(0);
    expect(stepIdx).toBeLessThan(doneIdx);
    expect(chunks[stepIdx]!.toolUses?.length).toBe(2);

    // A stopped tool_result for the stopping tool_use AND the trailing unrun one.
    const stopped = chunks.filter((c) => c.type === "tool_result" && c.kind === "stopped");
    expect(stopped).toHaveLength(2);
    const stoppedIds = stopped.map((c) => c.nodeId).sort();
    expect(stoppedIds).toEqual(["cs_0", "cs_1"]);
    // All stopped results precede done.
    for (const s of stopped) {
      expect(chunks.indexOf(s)).toBeLessThan(doneIdx);
    }
  });
});
