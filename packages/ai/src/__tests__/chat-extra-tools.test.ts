// Locks the Task 14 plumbing: `extraTools` (MCP) are actually merged into the
// tools array handed to the provider, in BOTH chat() and chatStream().
import { describe, it, expect, vi, beforeEach } from "vitest";
import { chat, chatStream } from "../chat";
import type { ToolDefinition } from "../providers";

const completeMock = vi.fn();
const streamMock = vi.fn();
vi.mock("../providers", async (orig) => {
  const actual = await orig<typeof import("../providers")>();
  return {
    ...actual,
    getProvider: () => ({ complete: completeMock, stream: streamMock }),
    createProvider: () => ({ complete: completeMock, stream: streamMock }),
  };
});
vi.mock("../routing", () => ({ getProviderForFeature: () => null, resolveResilientProvider: () => ({ complete: completeMock, stream: streamMock }) }));

const MCP_TOOL: ToolDefinition = {
  name: "mcp__stripe__list_invoices",
  description: "[stripe MCP] List invoices.",
  inputSchema: { type: "object", properties: {} },
};

beforeEach(() => {
  completeMock.mockReset();
  streamMock.mockReset();
});

describe("extraTools reach the provider request (spec §3.4)", () => {
  it("chat(): tools = financial set + extraTools", async () => {
    completeMock.mockResolvedValueOnce({ content: [{ type: "text", text: "hi" }], stopReason: "end_turn" });

    await chat({
      messages: [{ role: "user", content: "hello" }],
      financialContext: "ctx",
      onToolCall: async () => "{}",
      extraTools: [MCP_TOOL],
    });

    expect(completeMock).toHaveBeenCalledTimes(1);
    const req = completeMock.mock.calls[0]![0] as { tools?: ToolDefinition[] };
    const names = (req.tools ?? []).map((t) => t.name);
    expect(names).toContain("mcp__stripe__list_invoices");
    expect(names).toContain("create_scenario"); // financial set still present
  });

  it("chatStream(): tools = financial set + extraTools", async () => {
    streamMock.mockReturnValueOnce(
      (async function* () {
        yield { type: "done", response: { content: [{ type: "text", text: "hi" }], stopReason: "end_turn" } };
      })(),
    );

    for await (const _chunk of chatStream({
      messages: [{ role: "user", content: "hello" }],
      financialContext: "ctx",
      onToolCall: async () => "{}",
      extraTools: [MCP_TOOL],
    })) {
      /* drain */
    }

    expect(streamMock).toHaveBeenCalledTimes(1);
    const req = streamMock.mock.calls[0]![0] as { tools?: ToolDefinition[] };
    const names = (req.tools ?? []).map((t) => t.name);
    expect(names).toContain("mcp__stripe__list_invoices");
    expect(names).toContain("create_scenario");
  });

  it("no extraTools → tools array is exactly the financial set (no undefined holes)", async () => {
    completeMock.mockResolvedValueOnce({ content: [{ type: "text", text: "hi" }], stopReason: "end_turn" });
    await chat({
      messages: [{ role: "user", content: "hello" }],
      financialContext: "ctx",
      onToolCall: async () => "{}",
    });
    const req = completeMock.mock.calls[0]![0] as { tools?: ToolDefinition[] };
    expect(req.tools!.every((t) => typeof t?.name === "string")).toBe(true);
    expect(req.tools!.some((t) => t.name.startsWith("mcp__"))).toBe(false);
  });
});
