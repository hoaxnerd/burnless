// packages/ai/src/__tests__/chat-input-pause.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { chatStream } from "../chat";
import type { InputRequestState } from "../generative-ui";

// Force a deterministic fake provider regardless of env.
const streamMock = vi.fn();
vi.mock("../providers", async (orig) => {
  const actual = await orig<typeof import("../providers")>();
  return {
    ...actual,
    getProvider: () => ({ complete: vi.fn(), stream: streamMock }),
    createProvider: () => ({ complete: vi.fn(), stream: streamMock }),
  };
});
vi.mock("../routing", () => ({ getProviderForFeature: () => null }));

function fakeStream(blocks: unknown[], stopReason: string) {
  return (async function* () {
    yield { type: "done", response: { content: blocks, stopReason } };
  })();
}

beforeEach(() => streamMock.mockReset());

describe("chatStream input pause", () => {
  it("pauses and persists when the model calls request_input_form", async () => {
    streamMock.mockReturnValueOnce(
      fakeStream(
        [{ type: "tool_use", id: "tu-1", name: "request_input_form", input: { title: "Add", fields: [] } }],
        "tool_use"
      )
    );
    let captured: InputRequestState | null = null;
    const onInputRequest = vi.fn(async (s: InputRequestState) => {
      captured = s;
      return "pause-xyz";
    });

    const chunks: { type: string; pauseId?: string; spec?: { title: string } }[] = [];
    for await (const c of chatStream({
      messages: [{ role: "user", content: "add a revenue stream" }],
      financialContext: "ctx",
      onToolCall: vi.fn(),
      onInputRequest,
    })) {
      chunks.push(c as never);
    }

    expect(onInputRequest).toHaveBeenCalledOnce();
    expect(captured!.inputToolUseId).toBe("tu-1");
    expect(captured!.spec.title).toBe("Add");
    const types = chunks.map((c) => c.type);
    expect(types).toContain("input_request");
    expect(types).toContain("paused");
    expect(types).not.toContain("done"); // generator returns after pause
    expect(chunks.find((c) => c.type === "input_request")?.pauseId).toBe("pause-xyz");
    expect(chunks.find((c) => c.type === "input_request")?.spec?.title).toBe("Add");
  });

  it("defers a same-turn permission tool so the provider contract holds", async () => {
    streamMock.mockReturnValueOnce(
      fakeStream(
        [
          { type: "tool_use", id: "tu-w", name: "create_scenario", input: { name: "X" } },
          { type: "tool_use", id: "tu-i", name: "request_input_form", input: { title: "Q", fields: [] } },
        ],
        "tool_use"
      )
    );
    let captured: InputRequestState | null = null;
    for await (const _ of chatStream({
      messages: [{ role: "user", content: "go" }],
      financialContext: "ctx",
      onToolCall: vi.fn(),
      resolvePermission: () => "ask",
      onInputRequest: async (s) => { captured = s; return "p"; },
    })) { /* drain */ }

    // tu-w deferred into completedResults; tu-i is the input tool.
    expect(captured!.inputToolUseId).toBe("tu-i");
    const deferred = captured!.completedResults.find(
      (b) => (b as { toolUseId: string }).toolUseId === "tu-w"
    ) as { content: string };
    expect(JSON.parse(deferred.content).deferred).toBe(true);
  });
});
