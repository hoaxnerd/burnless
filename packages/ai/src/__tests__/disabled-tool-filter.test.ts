// packages/ai/src/__tests__/disabled-tool-filter.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture the tools the provider is offered (same stub pattern as chat-tools-override.test.ts).
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

describe("chat() disabledToolNames filter", () => {
  beforeEach(() => {
    captured.tools = undefined;
    fakeProvider.complete.mockClear();
  });

  it("removes disabled tools from the assembled set while leaving the rest", async () => {
    await chat({
      messages: [{ role: "user", content: "hi" }],
      financialContext: "ctx",
      onToolCall: async () => "ok",
      disabledToolNames: new Set(["record_transaction", "get_metrics"]),
      providerConfig: { apiKey: "x" },
    });
    const names = (captured.tools as { name: string }[]).map((t) => t.name);
    expect(names).not.toContain("record_transaction");
    expect(names).not.toContain("get_metrics");
    // Other tools survive unchanged.
    expect(names).toContain("list_accounts");
    expect(names).toContain("create_revenue_stream");
  });

  it("IGNORES disabledToolNames when toolsOverride is set (jobs unaffected)", async () => {
    const only = [
      { name: "record_transaction", description: "x", inputSchema: { type: "object" as const, properties: {} } },
    ];
    await chat({
      messages: [{ role: "user", content: "hi" }],
      financialContext: "ctx",
      onToolCall: async () => "ok",
      toolsOverride: only,
      // Even though record_transaction is "disabled", the frozen allowlist wins.
      disabledToolNames: new Set(["record_transaction"]),
      providerConfig: { apiKey: "x" },
    });
    const names = (captured.tools as { name: string }[]).map((t) => t.name);
    expect(names).toEqual(["record_transaction"]);
  });
});
