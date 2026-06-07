import { describe, it, expect, vi, beforeEach } from "vitest";
import { chatStream } from "../chat";

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

describe("chatStream deny decision", () => {
  it("denied write is never executed and gets a declined tool_result", async () => {
    streamMock
      .mockReturnValueOnce(
        fakeStream([{ type: "tool_use", id: "tu-w", name: "create_revenue_stream", input: { name: "X" } }], "tool_use"),
      )
      .mockReturnValueOnce(fakeStream([{ type: "text", text: "Blocked." }], "end_turn"));

    const onToolCall = vi.fn(async () => JSON.stringify({ ok: true }));
    const chunks: { type: string; toolResult?: string }[] = [];
    for await (const c of chatStream({
      messages: [{ role: "user", content: "write something" }],
      financialContext: "ctx",
      onToolCall,
      resolvePermission: () => "deny",
    })) {
      chunks.push(c as never);
    }

    expect(onToolCall).not.toHaveBeenCalled();
    const tr = chunks.find((c) => c.type === "tool_result");
    expect(tr).toBeTruthy();
    const parsed = JSON.parse(tr!.toolResult as string);
    expect(parsed).toMatchObject({ declined: true });
    expect(parsed.message).toMatch(/read-only/i);
    expect(chunks.some((c) => c.type === "done")).toBe(true);
  });

  it("mixed turn: denied write is skipped, allowed read still executes", async () => {
    streamMock
      .mockReturnValueOnce(
        fakeStream(
          [
            { type: "tool_use", id: "tu-w", name: "create_revenue_stream", input: { name: "X" } },
            { type: "tool_use", id: "tu-r", name: "get_metrics", input: {} },
          ],
          "tool_use",
        ),
      )
      .mockReturnValueOnce(fakeStream([{ type: "text", text: "Done what I could." }], "end_turn"));

    const onToolCall = vi.fn(async () => JSON.stringify({ ok: true }));
    // deny writes, allow everything else
    const resolvePermission = (name: string) =>
      name === "create_revenue_stream" ? ("deny" as const) : ("allow" as const);

    const chunks: { type: string; toolName?: string; toolResult?: string }[] = [];
    for await (const c of chatStream({
      messages: [{ role: "user", content: "do stuff" }],
      financialContext: "ctx",
      onToolCall,
      resolvePermission,
    })) {
      chunks.push(c as never);
    }

    // The allowed read executed exactly once; the denied write never did.
    expect(onToolCall).toHaveBeenCalledTimes(1);
    expect(onToolCall).toHaveBeenCalledWith("get_metrics", {});
    // Both tools produced a tool_result chunk (one declined, one real).
    const results = chunks.filter((c) => c.type === "tool_result");
    expect(results.length).toBe(2);
    const declined = results.find((r) => {
      try { return JSON.parse(r.toolResult as string).declined === true; } catch { return false; }
    });
    expect(declined).toBeTruthy();
  });
});
