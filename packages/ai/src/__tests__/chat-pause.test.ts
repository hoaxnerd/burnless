// packages/ai/src/__tests__/chat-pause.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// A scripted fake provider: each call to stream() shifts the next event batch.
const scriptedBatches: any[][] = [];
const fakeProvider = {
  modelId: "fake",
  async *stream() {
    const batch = scriptedBatches.shift() ?? [{ type: "done", response: { content: [{ type: "text", text: "" }], stopReason: "end_turn" } }];
    for (const e of batch) yield e;
  },
  async complete() { throw new Error("not used"); },
};

vi.mock("../routing", () => ({
  getProviderForFeature: () => fakeProvider,
}));
vi.mock("../providers", async (orig) => {
  const actual = await (orig as any)();
  return { ...actual, getProvider: () => fakeProvider, createProvider: () => fakeProvider };
});

import { chatStream } from "../chat";
import type { StreamChunk, PauseState } from "../types";

beforeEach(() => {
  scriptedBatches.length = 0;
});

async function collect(gen: AsyncGenerator<StreamChunk>): Promise<StreamChunk[]> {
  const out: StreamChunk[] = [];
  for await (const c of gen) out.push(c);
  return out;
}

describe("chatStream pause/resume", () => {
  it("pauses when a tool resolves to ask, executing none of it", async () => {
    scriptedBatches.push([
      { type: "tool_use", id: "t1", name: "create_scenario", input: { name: "X" } },
      { type: "done", response: { content: [{ type: "tool_use", id: "t1", name: "create_scenario", input: { name: "X" } }], stopReason: "tool_use" } },
    ]);

    const onToolCall = vi.fn(async () => JSON.stringify({ ok: true }));
    let paused: PauseState | null = null;

    const chunks = await collect(
      chatStream({
        messages: [{ role: "user", content: "make a scenario" }],
        financialContext: "",
        onToolCall,
        resolvePermission: () => "ask",
        onPause: async (state) => {
          paused = state;
          return "pause-1";
        },
      })
    );

    expect(onToolCall).not.toHaveBeenCalled();
    const req = chunks.find((c) => c.type === "permission_request");
    expect(req?.actions?.[0]?.toolName).toBe("create_scenario");
    expect(req?.pauseId).toBe("pause-1");
    expect(chunks.some((c) => c.type === "paused")).toBe(true);
    expect(chunks.some((c) => c.type === "done")).toBe(false); // it returned at pause
    expect(paused!.pending[0]!.requestId).toBe("t1");
    expect(paused!.assistantBlocks.length).toBe(1);
  });

  it("auto-executes an allowed tool then completes", async () => {
    scriptedBatches.push([
      { type: "tool_use", id: "t1", name: "get_metrics", input: {} },
      { type: "done", response: { content: [{ type: "tool_use", id: "t1", name: "get_metrics", input: {} }], stopReason: "tool_use" } },
    ]);
    scriptedBatches.push([
      { type: "text_delta", text: "Here are your metrics." },
      { type: "done", response: { content: [{ type: "text", text: "Here are your metrics." }], stopReason: "end_turn" } },
    ]);

    const onToolCall = vi.fn(async () => JSON.stringify({ mrr: 1000 }));
    const chunks = await collect(
      chatStream({
        messages: [{ role: "user", content: "metrics?" }],
        financialContext: "",
        onToolCall,
        resolvePermission: () => "allow",
        onPause: async () => "unused",
      })
    );

    expect(onToolCall).toHaveBeenCalledOnce();
    expect(chunks.some((c) => c.type === "tool_status" && c.phase === "running")).toBe(true);
    expect(chunks.some((c) => c.type === "tool_status" && c.phase === "done")).toBe(true);
    expect(chunks.some((c) => c.type === "done")).toBe(true);
    expect(chunks.some((c) => c.type === "permission_request")).toBe(false);
  });
});
