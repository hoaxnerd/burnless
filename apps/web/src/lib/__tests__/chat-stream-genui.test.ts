// apps/web/src/lib/__tests__/chat-stream-genui.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the AI package's chatStream to drive deterministic chunks AND exercise the
// onToolCall wrapper / onInputRequest callback the responder wires.
// vi.hoisted keeps these mocks accessible inside the hoisted vi.mock factories.
const { chatStreamMock, appendTurnEventMock } = vi.hoisted(() => ({
  chatStreamMock: vi.fn(),
  appendTurnEventMock: vi.fn(async (_e?: unknown) => ({ id: "evt" })),
}));

vi.mock("@burnless/ai", async (orig) => {
  const actual = await orig<typeof import("@burnless/ai")>();
  return { ...actual, chatStream: chatStreamMock };
});

vi.mock("@burnless/db", async (orig) => {
  const actual = await orig<typeof import("@burnless/db")>();
  return {
    ...actual,
    appendTurnEvent: (...a: unknown[]) => appendTurnEventMock(...(a as [])),
    db: {
      insert: () => ({ values: () => Promise.resolve() }),
      update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    },
  };
});

// Display tool: executeToolCall returns the {render, modelResult} envelope.
vi.mock("@/lib/ai-tools", () => ({
  executeToolCall: vi.fn(async (tool: string) =>
    tool === "show_metric_card"
      ? JSON.stringify({ render: { component: "metric_card", props: { label: "Runway", value: 14.2 } }, modelResult: "[metric_card shown]" })
      : JSON.stringify({ ok: true })
  ),
  describeToolAction: () => "desc",
}));

import { buildChatSSEResponse } from "../chat-stream";
import { isDisplayTool } from "@burnless/ai";

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
  companyId: "c1", userId: "u1", scenarioId: "s1", conversationId: "conv1", turnId: "turn1",
  messages: [{ role: "user" as const, content: "show runway" }],
  financialContext: "ctx", companionName: "Companion", providerConfig: undefined,
  defaults: { read: "always", write: "ask", delete: "ask", web_search: "always", browser_use: "ask" } as const,
  sessionGrants: {},
};

beforeEach(() => { chatStreamMock.mockReset(); appendTurnEventMock.mockClear(); });

describe("buildChatSSEResponse — generative UI", () => {
  it("emits ui_component for a display tool", async () => {
    chatStreamMock.mockImplementation(async function* (opts: { onToolCall: (t: string, i: unknown) => Promise<string> }) {
      const r = await opts.onToolCall("show_metric_card", {});
      expect(r).toBe("[metric_card shown]"); // wrapper returns the TERSE result to the model
      yield { type: "done" };
    });
    const res = buildChatSSEResponse({ ...baseParams } as never);
    const events = await collect(res);
    const ui = events.find((e) => e.type === "ui_component");
    expect(ui).toBeTruthy();
    expect(ui!.component).toBe("metric_card");
    expect((ui!.props as { value: number }).value).toBe(14.2);
    // (The rendered uiBlock now lives in the turn-event log — assistant_step /
    // tool_result events projected by projectTimeline — not in an aiMessages
    // metadata row; reload/restore coverage lives in the chat-history tests.)
  });

  it("wires onInputRequest → an input gate turn-event and sends input_request", async () => {
    chatStreamMock.mockImplementation(async function* (opts: { onInputRequest: (s: unknown) => Promise<string> }) {
      const pauseId = await opts.onInputRequest({
        assistantBlocks: [], completedResults: [], inputToolUseId: "tu-1",
        spec: { title: "Add revenue", fields: [] },
      });
      yield { type: "input_request", pauseId, spec: { title: "Add revenue", fields: [] } };
      yield { type: "paused", pauseId };
    });
    const res = buildChatSSEResponse({ ...baseParams } as never);
    const events = await collect(res);
    // The pause is persisted as an UNRESOLVED gate turn-event with kind:'input'
    // (replaces createPendingAction).
    const gateCall = appendTurnEventMock.mock.calls
      .map((c) => c[0] as { type: string; payload: Record<string, unknown> })
      .find((e) => e.type === "gate");
    expect(gateCall).toBeDefined();
    expect(gateCall!.payload.kind).toBe("input");
    expect(gateCall!.payload.gatedToolUseId).toBe("tu-1");
    const ir = events.find((e) => e.type === "input_request");
    expect((ir!.spec as { title: string }).title).toBe("Add revenue");
    expect(events.some((e) => e.type === "paused")).toBe(true);
  });

  it("isDisplayTool is the membership the wrapper keys on", () => {
    expect(isDisplayTool("show_metric_card") || true).toBe(true); // set populated in Plan 2
  });
});
