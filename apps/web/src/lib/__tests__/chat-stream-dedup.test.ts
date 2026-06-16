// apps/web/src/lib/__tests__/chat-stream-dedup.test.ts
/**
 * AI-05: identical DISPLAY-only genui blocks emitted twice within one turn
 * collapse to a SINGLE ui_component event. The model sometimes re-issues the same
 * show_* tool; the second identical render is suppressed while the terse
 * modelResult still flows back to the model loop (so the loop is unaffected).
 * A render with DIFFERENT props is NOT deduped.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { chatStreamMock, executeToolCallMock } = vi.hoisted(() => ({
  chatStreamMock: vi.fn(),
  executeToolCallMock: vi.fn(),
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
    db: {
      insert: () => ({ values: () => Promise.resolve() }),
      update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    },
  };
});

vi.mock("@/lib/ai-tools", () => ({
  executeToolCall: (...args: unknown[]) => executeToolCallMock(...args),
  describeToolAction: () => "desc",
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
  companyId: "c1", userId: "u1", scenarioId: "s1", writeScenarioId: null, conversationId: "conv1",
  messages: [{ role: "user" as const, content: "show runway" }],
  financialContext: "ctx", companionName: "Companion", providerConfig: undefined,
  defaults: { read: "always", write: "ask", delete: "ask", web_search: "always", browser_use: "ask" } as const,
  sessionGrants: {},
};

const RUNWAY_ENVELOPE = JSON.stringify({
  render: { component: "show_runway", props: { months: 14.2, asOf: "2026-06" } },
  modelResult: "[show_runway shown]",
});

beforeEach(() => { chatStreamMock.mockReset(); executeToolCallMock.mockReset(); });

describe("buildChatSSEResponse — display dedup (AI-05)", () => {
  it("collapses two identical display renders to ONE ui_component event", async () => {
    executeToolCallMock.mockResolvedValue(RUNWAY_ENVELOPE);
    chatStreamMock.mockImplementation(async function* (opts: { onToolCall: (t: string, i: unknown) => Promise<string> }) {
      const r1 = await opts.onToolCall("show_runway", {});
      const r2 = await opts.onToolCall("show_runway", {});
      // Both calls still return the terse modelResult — model loop unaffected.
      expect(r1).toBe("[show_runway shown]");
      expect(r2).toBe("[show_runway shown]");
      yield { type: "done" };
    });
    const res = buildChatSSEResponse({ ...baseParams } as never);
    const events = await collect(res);
    const uiEvents = events.filter((e) => e.type === "ui_component");
    expect(uiEvents).toHaveLength(1);
    expect(uiEvents[0]!.component).toBe("show_runway");
  });

  it("does NOT dedup renders that differ in props", async () => {
    executeToolCallMock
      .mockResolvedValueOnce(RUNWAY_ENVELOPE)
      .mockResolvedValueOnce(JSON.stringify({
        render: { component: "show_runway", props: { months: 9.1, asOf: "2026-06" } },
        modelResult: "[show_runway shown]",
      }));
    chatStreamMock.mockImplementation(async function* (opts: { onToolCall: (t: string, i: unknown) => Promise<string> }) {
      await opts.onToolCall("show_runway", {});
      await opts.onToolCall("show_runway", {});
      yield { type: "done" };
    });
    const res = buildChatSSEResponse({ ...baseParams } as never);
    const events = await collect(res);
    const uiEvents = events.filter((e) => e.type === "ui_component");
    expect(uiEvents).toHaveLength(2);
  });
});
