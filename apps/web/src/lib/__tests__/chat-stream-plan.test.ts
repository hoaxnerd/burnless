import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted keeps these mocks accessible inside the hoisted vi.mock factories.
const { chatStreamMock, createPendingActionMock } = vi.hoisted(() => ({
  chatStreamMock: vi.fn(),
  createPendingActionMock: vi.fn(async () => ({ id: "row-1" })),
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
    createPendingAction: (...a: unknown[]) => createPendingActionMock(...(a as [])),
    db: {
      insert: () => ({ values: () => Promise.resolve() }),
      update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    },
  };
});

vi.mock("@/lib/ai-tools", () => ({
  executeToolCall: vi.fn(async () => JSON.stringify({ ok: true })),
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
  companyId: "c1", userId: "u1", scenarioId: "s1", conversationId: "conv1",
  messages: [{ role: "user" as const, content: "model a hire" }],
  financialContext: "ctx", companionName: "Companion", providerConfig: undefined,
  defaults: { read: "always", write: "ask", delete: "ask", web_search: "always", browser_use: "ask" } as const,
  sessionGrants: {},
};

beforeEach(() => { chatStreamMock.mockReset(); createPendingActionMock.mockClear(); });

describe("buildChatSSEResponse — plan pause", () => {
  it("wires onPlanRequest → createPendingAction(kind:'plan') and sends plan_request", async () => {
    chatStreamMock.mockImplementation(async function* (opts: { onPlanRequest: (s: unknown) => Promise<string> }) {
      const pauseId = await opts.onPlanRequest({
        assistantBlocks: [], completedResults: [], planToolUseId: "tu-p",
        spec: { title: "Model hire", steps: [] },
      });
      yield { type: "plan_request", pauseId, plan: { title: "Model hire", steps: [] } };
      yield { type: "paused", pauseId };
    });
    const res = buildChatSSEResponse({ ...baseParams } as never);
    const events = await collect(res);
    expect(createPendingActionMock).toHaveBeenCalledOnce();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(((createPendingActionMock.mock.calls[0] as any)[0] as { kind: string }).kind).toBe("plan");
    const pr = events.find((e) => e.type === "plan_request");
    expect((pr!.plan as { title: string }).title).toBe("Model hire");
    expect(events.some((e) => e.type === "paused")).toBe(true);
  });
});
