// apps/web/src/lib/__tests__/chat-stream-confidence.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted keeps these mocks accessible inside the hoisted vi.mock factories.
const { chatStreamMock, insertValues } = vi.hoisted(() => ({
  chatStreamMock: vi.fn(),
  insertValues: vi.fn(() => Promise.resolve()),
}));

vi.mock("@burnless/ai", async (orig) => {
  const actual = await orig<typeof import("@burnless/ai")>();
  return { ...actual, chatStream: chatStreamMock };
});

vi.mock("@burnless/db", async (orig) => {
  const actual = await orig<typeof import("@burnless/db")>();
  return {
    ...actual,
    appendTurnEvent: vi.fn(async () => ({ id: "evt" })),
    createPendingAction: vi.fn(async () => ({ id: "r1" })),
    db: {
      insert: () => ({ values: insertValues }),
      update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    },
  };
});

// A display tool returns the envelope WITH confidence + rationale.
vi.mock("@/lib/ai-tools", () => ({
  executeToolCall: vi.fn(async () =>
    JSON.stringify({
      render: { component: "runway", props: { months: 12 } },
      modelResult: "[runway shown]",
      confidence: "high",
      rationale: "because you said model the new hire",
    }),
  ),
  describeToolAction: () => "d",
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
  companyId: "c1", userId: "u1", scenarioId: "s1", conversationId: "conv1",
  messages: [{ role: "user" as const, content: "show my runway" }],
  financialContext: "ctx", companionName: "Aria", providerConfig: undefined,
  defaults: { read: "always", write: "ask", delete: "ask", web_search: "always", browser_use: "ask" } as const,
  sessionGrants: {}, writeMode: "confirm" as const,
};

beforeEach(() => { chatStreamMock.mockReset(); insertValues.mockClear(); });

describe("buildChatSSEResponse — confidence on display results", () => {
  it("forwards confidence + rationale onto the ui_component event", async () => {
    chatStreamMock.mockImplementation(async function* (opts: { onToolCall: (n: string, i: unknown) => Promise<string> }) {
      await opts.onToolCall("show_runway", {});
      yield { type: "done" };
    });
    const res = buildChatSSEResponse(baseParams as never);
    const events = await collect(res);
    const ui = events.find((e) => e.type === "ui_component") as { confidence?: string; rationale?: string };
    expect(ui.confidence).toBe("high");
    expect(ui.rationale).toContain("because you said");
  });
});
