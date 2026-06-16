import { describe, it, expect, vi, beforeEach } from "vitest";

const { resolvePermissionMock, chatStreamMock } = vi.hoisted(() => {
  const resolvePermissionMock = vi.fn(() => "ask");
  const chatStreamMock = vi.fn();
  return { resolvePermissionMock, chatStreamMock };
});

vi.mock("@burnless/ai", async (orig) => {
  const actual = await orig<typeof import("@burnless/ai")>();
  return { ...actual, chatStream: chatStreamMock, resolvePermission: resolvePermissionMock };
});
vi.mock("@burnless/db", async (orig) => {
  const actual = await orig<typeof import("@burnless/db")>();
  return {
    ...actual,
    appendTurnEvent: vi.fn(async () => ({ id: "evt" })),
    createPendingAction: vi.fn(async () => ({ id: "r1" })),
    db: { insert: () => ({ values: () => Promise.resolve() }), update: () => ({ set: () => ({ where: () => Promise.resolve() }) }) },
  };
});
vi.mock("@/lib/ai-tools", () => ({ executeToolCall: vi.fn(async () => "{}"), describeToolAction: () => "d" }));

import { buildChatSSEResponse } from "../chat-stream";

const baseParams = {
  companyId: "c1", userId: "u1", scenarioId: "s1", conversationId: "conv1",
  messages: [{ role: "user" as const, content: "hi" }],
  financialContext: "ctx", companionName: "Aria", providerConfig: undefined,
  defaults: { read: "always", write: "ask", delete: "ask", web_search: "always", browser_use: "ask" } as const,
  sessionGrants: {}, writeMode: "confirm" as const,
};

beforeEach(() => { resolvePermissionMock.mockClear(); chatStreamMock.mockReset(); });

describe("buildChatSSEResponse threads writeMode into resolvePermission", () => {
  it("passes ctx.writeMode through to the resolver", async () => {
    chatStreamMock.mockImplementation(async function* (opts: { resolvePermission: (t: string, i: unknown) => string }) {
      opts.resolvePermission("create_revenue_stream", {});
      yield { type: "done" };
    });
    const res = buildChatSSEResponse(baseParams as never);
    const reader = res.body!.getReader();
    // Drain the full stream so the mocked chatStream body (which calls
    // resolvePermission) has definitely run before we assert.
    for (;;) {
      const { done } = await reader.read();
      if (done) break;
    }
    expect(resolvePermissionMock).toHaveBeenCalledWith(
      "create_revenue_stream",
      expect.objectContaining({ writeMode: "confirm" }),
    );
  });
});
