// apps/web/src/lib/__tests__/chat-stream-diff-gate.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted keeps these mocks accessible inside the hoisted vi.mock factories.
const { chatStreamMock, createPendingActionMock, executeToolCallMock } = vi.hoisted(() => ({
  chatStreamMock: vi.fn(),
  createPendingActionMock: vi.fn(async (_args: Record<string, unknown>) => ({ id: "row-1" })),
  // executeToolCall in plan mode returns the facade envelope for a write; the
  // diff-gate enrichment parses { planned, overrides } off it.
  executeToolCallMock: vi.fn(async (_tool: string, _input: unknown, ctx: { mode?: string }) => {
    if (ctx.mode === "plan") {
      return JSON.stringify({
        planned: true,
        overrides: [{ action: "create", entityType: "revenue_stream", entityId: "id1", before: null, after: { id: "id1", name: "Pro Plan" } }],
      });
    }
    return JSON.stringify({ success: true });
  }),
}));

vi.mock("@burnless/ai", async (orig) => {
  const actual = await orig<typeof import("@burnless/ai")>();
  return { ...actual, chatStream: chatStreamMock };
});

vi.mock("@burnless/db", async (orig) => {
  const actual = await orig<typeof import("@burnless/db")>();
  return {
    ...actual,
    createPendingAction: (...a: unknown[]) => createPendingActionMock(...(a as [Record<string, unknown>])),
    db: {
      insert: () => ({ values: () => Promise.resolve() }),
      update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    },
  };
});

vi.mock("@/lib/ai-tools", () => ({
  executeToolCall: (...a: unknown[]) => executeToolCallMock(...(a as [string, unknown, { mode?: string }])),
  describeToolAction: () => "create revenue stream \"Pro Plan\"",
}));

import { buildChatSSEResponse } from "../chat-stream";

async function collect(res: Response): Promise<Record<string, unknown>[]> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const events: Record<string, unknown>[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    for (const part of buf.split("\n\n")) {
      if (part.startsWith("data: ")) events.push(JSON.parse(part.slice(6)));
    }
    buf = buf.includes("\n\n") ? buf.slice(buf.lastIndexOf("\n\n") + 2) : buf;
  }
  return events;
}

const baseParams = {
  // AI-01: writeScenarioId is the WRITE target the diff-gate computes the override
  // against; this test models an overlay write in scenario "s1".
  companyId: "c1", userId: "u1", scenarioId: "s1", writeScenarioId: "s1", conversationId: "conv1",
  messages: [{ role: "user" as const, content: "add a pro plan stream" }],
  financialContext: "ctx", companionName: "Aria", providerConfig: undefined,
  defaults: { read: "always", write: "ask", delete: "ask", web_search: "always", browser_use: "ask" } as const,
  sessionGrants: {}, writeMode: "confirm" as const,
};

beforeEach(() => { chatStreamMock.mockReset(); createPendingActionMock.mockClear(); executeToolCallMock.mockClear(); });

describe("buildChatSSEResponse — diff-gate pause enrichment", () => {
  it("computes the override via mode:'plan' and attaches it to the pending row + SSE", async () => {
    chatStreamMock.mockImplementation(async function* (opts: { onPause: (s: unknown) => Promise<string> }) {
      const pending = [{ requestId: "tu-w", toolName: "create_revenue_stream", toolInput: { name: "Pro Plan" } }];
      const pauseId = await opts.onPause({ assistantBlocks: [], completedResults: [], pending });
      yield { type: "permission_request", pauseId, actions: pending };
      yield { type: "paused", pauseId };
    });

    const res = buildChatSSEResponse(baseParams as never);
    const events = await collect(res);

    // executeToolCall was called in plan mode (delta computed, no write).
    expect(executeToolCallMock).toHaveBeenCalledWith(
      "create_revenue_stream",
      { name: "Pro Plan" },
      expect.objectContaining({ mode: "plan", scenarioId: "s1" }),
    );

    // persisted pending row carries the override delta.
    const persisted = createPendingActionMock.mock.calls[0]![0] as { pending: { requestId: string; override?: unknown[] }[] };
    expect(persisted.pending[0]!.override).toBeTruthy();
    expect((persisted.pending[0]!.override as { action: string }[])[0]!.action).toBe("create");

    // live SSE permission_request action carries the same override.
    const pr = events.find((e) => e.type === "permission_request") as { actions: { override?: unknown[] }[] };
    expect(pr.actions[0]!.override).toBeTruthy();
    expect((pr.actions[0]!.override as { entityType: string }[])[0]!.entityType).toBe("revenue_stream");
  });

  it("a non-facade mutation (empty overrides) attaches no diff", async () => {
    executeToolCallMock.mockImplementation(async (_t, _i, ctx: { mode?: string }) =>
      ctx.mode === "plan" ? JSON.stringify({ planned: true, overrides: [] }) : JSON.stringify({ success: true }),
    );
    chatStreamMock.mockImplementation(async function* (opts: { onPause: (s: unknown) => Promise<string> }) {
      const pending = [{ requestId: "tu-s", toolName: "create_scenario", toolInput: { name: "S" } }];
      const pauseId = await opts.onPause({ assistantBlocks: [], completedResults: [], pending });
      yield { type: "permission_request", pauseId, actions: pending };
      yield { type: "paused", pauseId };
    });
    const res = buildChatSSEResponse(baseParams as never);
    const events = await collect(res);
    const pr = events.find((e) => e.type === "permission_request") as { actions: { override?: unknown[] | null }[] };
    expect(pr.actions[0]!.override ?? null).toBeNull();
  });

  it("an mcp__ write pending approval is NEVER plan-executed during the pause (no live MCP call), no diff attached", async () => {
    // MCP dispatch hits the LIVE external server and ignores mode:"plan" — the
    // enrichment loop must skip mcp__* entirely or the action runs before the
    // user approves (and again on resume). MCP tools can't produce an override
    // diff anyway.
    chatStreamMock.mockImplementation(async function* (opts: { onPause: (s: unknown) => Promise<string> }) {
      const pending = [
        { requestId: "tu-m", toolName: "mcp__stripe__send_reminder", toolInput: { invoice: "in_1" } },
        { requestId: "tu-w", toolName: "create_revenue_stream", toolInput: { name: "Pro Plan" } },
      ];
      const pauseId = await opts.onPause({ assistantBlocks: [], completedResults: [], pending });
      yield { type: "permission_request", pauseId, actions: pending };
      yield { type: "paused", pauseId };
    });

    const res = buildChatSSEResponse({
      ...baseParams,
      mcp: { tools: [], categories: { mcp__stripe__send_reminder: "write" } },
    } as never);
    const events = await collect(res);

    // The MCP tool was never executed in any mode during the pause…
    const mcpCalls = executeToolCallMock.mock.calls.filter(([tool]) => tool === "mcp__stripe__send_reminder");
    expect(mcpCalls).toHaveLength(0);
    // …while the facade write still got its plan-mode diff.
    expect(executeToolCallMock).toHaveBeenCalledWith(
      "create_revenue_stream",
      { name: "Pro Plan" },
      expect.objectContaining({ mode: "plan" }),
    );

    const pr = events.find((e) => e.type === "permission_request") as {
      actions: { tool: string; category: string; override?: unknown[] | null }[];
    };
    const mcpAction = pr.actions.find((a) => a.tool === "mcp__stripe__send_reminder")!;
    expect(mcpAction.override ?? null).toBeNull();
    // Category comes from the dynamic map → still gates as a write.
    expect(mcpAction.category).toBe("write");
  });
});
