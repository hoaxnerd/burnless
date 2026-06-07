// apps/web/src/lib/__tests__/chat-stream-timeline.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted keeps these mocks accessible inside the hoisted vi.mock factories.
const { chatStreamMock, insertValues } = vi.hoisted(() => ({
  chatStreamMock: vi.fn(),
  insertValues: vi.fn((_row?: unknown) => Promise.resolve()),
}));

vi.mock("@burnless/ai", async (orig) => {
  const actual = await orig<typeof import("@burnless/ai")>();
  return { ...actual, chatStream: chatStreamMock };
});

vi.mock("@burnless/db", async (orig) => {
  const actual = await orig<typeof import("@burnless/db")>();
  return {
    ...actual,
    createPendingAction: vi.fn(async () => ({ id: "r1" })),
    db: { insert: () => ({ values: insertValues }), update: () => ({ set: () => ({ where: () => Promise.resolve() }) }) },
  };
});
vi.mock("@/lib/ai-tools", () => ({ executeToolCall: vi.fn(async () => "{}"), describeToolAction: () => "d" }));

import { buildChatSSEResponse } from "../chat-stream";

async function collect(res: Response): Promise<Record<string, unknown>[]> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = ""; const events: Record<string, unknown>[] = [];
  for (;;) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true });
    for (const part of buf.split("\n\n")) if (part.startsWith("data: ")) events.push(JSON.parse(part.slice(6)));
    buf = buf.includes("\n\n") ? buf.slice(buf.lastIndexOf("\n\n") + 2) : buf; }
  return events;
}

const baseParams = {
  companyId: "c1", userId: "u1", scenarioId: "s1", conversationId: "conv1",
  messages: [{ role: "user" as const, content: "show runway" }],
  financialContext: "ctx", companionName: "Aria", providerConfig: undefined,
  defaults: { read: "always", write: "ask", delete: "ask", web_search: "always", browser_use: "ask" } as const,
  sessionGrants: {}, writeMode: "confirm" as const,
};

beforeEach(() => { chatStreamMock.mockReset(); insertValues.mockClear(); });

describe("buildChatSSEResponse — timeline accumulation", () => {
  it("forwards nodeId/nodeKind on tool_status + persists a timeline on done", async () => {
    chatStreamMock.mockImplementation(async function* () {
      yield { type: "tool_use", toolName: "show_runway", toolInput: {}, nodeId: "tu-1", nodeKind: "tool" };
      yield { type: "tool_status", toolName: "show_runway", phase: "running", nodeId: "tu-1", nodeKind: "tool" };
      yield { type: "tool_status", toolName: "show_runway", phase: "done", nodeId: "tu-1", nodeKind: "tool" };
      yield { type: "text", content: "Your runway is healthy." };
      yield { type: "done" };
    });
    const res = buildChatSSEResponse(baseParams as never);
    const events = await collect(res);

    const status = events.find((e) => e.type === "tool_status") as { nodeId?: string; nodeKind?: string };
    expect(status.nodeId).toBe("tu-1");
    expect(status.nodeKind).toBe("tool");

    // metadata persisted on done carries an ordered timeline (tool node + text result node).
    const saved = insertValues.mock.calls.find((c) => (c[0] as { role?: string })?.role === "assistant")?.[0] as { metadata?: { timeline?: { kind: string }[] } };
    expect(saved?.metadata?.timeline).toBeTruthy();
    const kinds = saved!.metadata!.timeline!.map((n) => n.kind);
    expect(kinds).toContain("tool");
    expect(kinds).toContain("result");
  });
});
