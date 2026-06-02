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

function fakeStream(blocks: unknown[], stopReason: string, textDeltas: string[] = []) {
  return (async function* () {
    for (const t of textDeltas) yield { type: "text_delta", text: t };
    yield { type: "done", response: { content: blocks, stopReason } };
  })();
}

beforeEach(() => streamMock.mockReset());

describe("chatStream empty-response fallback", () => {
  it("yields a friendly fallback when the model returns no text and no tools", async () => {
    streamMock.mockReturnValueOnce(fakeStream([], "stop", [])); // empty completion
    const chunks: { type: string; content?: string }[] = [];
    for await (const c of chatStream({
      messages: [{ role: "user", content: "show my MRR and a chart" }],
      financialContext: "ctx",
      onToolCall: vi.fn(),
    })) {
      chunks.push(c as never);
    }
    const text = chunks.filter((c) => c.type === "text").map((c) => c.content).join("");
    expect(text.length).toBeGreaterThan(0); // not a blank bubble
    expect(text.toLowerCase()).toMatch(/again|try/);
    expect(chunks.some((c) => c.type === "done")).toBe(true);
  });

  it("does NOT add the fallback when the model produced real text", async () => {
    streamMock.mockReturnValueOnce(fakeStream([{ type: "text", text: "Your MRR is healthy." }], "stop", ["Your MRR is healthy."]));
    const chunks: { type: string; content?: string }[] = [];
    for await (const c of chatStream({ messages: [{ role: "user", content: "how am I doing" }], financialContext: "ctx", onToolCall: vi.fn() })) {
      chunks.push(c as never);
    }
    const text = chunks.filter((c) => c.type === "text").map((c) => c.content).join("");
    expect(text).toBe("Your MRR is healthy.");
    expect(text.toLowerCase()).not.toMatch(/wasn't able|try again/);
  });
});
