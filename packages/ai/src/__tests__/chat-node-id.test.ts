// packages/ai/src/__tests__/chat-node-id.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { chatStream } from "../chat";

const streamMock = vi.fn();
vi.mock("../providers", async (orig) => {
  const actual = await orig<typeof import("../providers")>();
  return { ...actual, getProvider: () => ({ complete: vi.fn(), stream: streamMock }), createProvider: () => ({ complete: vi.fn(), stream: streamMock }) };
});
vi.mock("../routing", () => ({ getProviderForFeature: () => null }));

function fakeStream(blocks: unknown[], stopReason: string) {
  return (async function* () { yield { type: "done", response: { content: blocks, stopReason } }; })();
}
beforeEach(() => streamMock.mockReset());

describe("chatStream emits stable nodeId on tool chunks", () => {
  it("tool_use/tool_status/tool_result for one auto-run tool share nodeId = tool_use id", async () => {
    streamMock
      .mockReturnValueOnce(fakeStream([{ type: "tool_use", id: "tu-1", name: "show_runway", input: {} }], "tool_use"))
      .mockReturnValueOnce(fakeStream([{ type: "text", text: "done" }], "end_turn"));
    const chunks: { type: string; nodeId?: string; nodeKind?: string }[] = [];
    for await (const c of chatStream({
      messages: [{ role: "user", content: "show runway" }],
      financialContext: "ctx",
      onToolCall: vi.fn(async () => JSON.stringify({ ok: true })),
      resolvePermission: () => "allow",
    })) {
      chunks.push(c as never);
    }
    const toolChunks = chunks.filter((c) => ["tool_use", "tool_status", "tool_result"].includes(c.type));
    expect(toolChunks.length).toBeGreaterThanOrEqual(3);
    for (const c of toolChunks) {
      expect(c.nodeId).toBe("tu-1");
      expect(c.nodeKind).toBe("tool");
    }
  });
});
