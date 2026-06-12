// packages/ai/src/__tests__/chat-tools-override.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture the tools the provider is offered.
const captured: { tools?: unknown[] } = {};
const fakeProvider = {
  complete: vi.fn(async (req: { tools?: unknown[] }) => {
    captured.tools = req.tools;
    return { stopReason: "end_turn", content: [{ type: "text", text: "done" }] };
  }),
};
vi.mock("../providers", async (orig) => {
  const actual = await (orig as () => Promise<Record<string, unknown>>)();
  return { ...actual, getProvider: () => fakeProvider, createProvider: () => fakeProvider };
});

import { chat } from "../chat";

describe("chat() toolsOverride", () => {
  beforeEach(() => { captured.tools = undefined; fakeProvider.complete.mockClear(); });

  it("offers ONLY the override tools when toolsOverride is provided", async () => {
    const only = [{ name: "list_accounts", description: "x", inputSchema: { type: "object" as const, properties: {} } }];
    await chat({
      messages: [{ role: "user", content: "hi" }],
      financialContext: "ctx",
      onToolCall: async () => "ok",
      toolsOverride: only,
      providerConfig: { apiKey: "x" },
    });
    const names = (captured.tools as { name: string }[]).map((t) => t.name);
    expect(names).toEqual(["list_accounts"]); // NOT the full ~60-tool financial set
  });

  it("falls back to the full financial set when toolsOverride is absent", async () => {
    await chat({
      messages: [{ role: "user", content: "hi" }],
      financialContext: "ctx",
      onToolCall: async () => "ok",
      providerConfig: { apiKey: "x" },
    });
    const names = (captured.tools as { name: string }[]).map((t) => t.name);
    expect(names.length).toBeGreaterThan(1);
    expect(names).toContain("list_accounts");
  });
});
