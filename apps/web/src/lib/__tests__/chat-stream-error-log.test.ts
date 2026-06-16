// apps/web/src/lib/__tests__/chat-stream-error-log.test.ts
/**
 * E1: when the underlying LLM stream throws, the catch boundary logs the failure
 * via the server logger BEFORE sending the `{type:"error"}` chunk to the client.
 * Self-host operators (`burnless start`) otherwise get NO visibility into chat
 * failures — the error only reaches the browser. We assert it logs with safe
 * identifiers (conversationId + err) and never the user message/prompt body.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { chatStreamMock, executeToolCallMock, loggerErrorMock } = vi.hoisted(() => ({
  chatStreamMock: vi.fn(),
  executeToolCallMock: vi.fn(),
  loggerErrorMock: vi.fn(),
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
    createPendingAction: vi.fn(async () => ({ id: "row-1" })),
    db: {
      insert: () => ({ values: () => ({ catch: () => Promise.resolve() }) }),
      update: () => ({ set: () => ({ where: () => ({ catch: () => Promise.resolve() }) }) }),
    },
  };
});

vi.mock("@/lib/ai-tools", () => ({
  executeToolCall: (...args: unknown[]) => executeToolCallMock(...args),
  describeToolAction: () => "desc",
}));

vi.mock("@/lib/logger", () => ({
  logger: () => ({ error: loggerErrorMock, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
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
  companyId: "c1", userId: "u1", scenarioId: "s1", writeScenarioId: null, conversationId: "conv-err-1",
  messages: [{ role: "user" as const, content: "secret prompt body that must not be logged" }],
  financialContext: "ctx", companionName: "Companion", providerConfig: undefined,
  defaults: { read: "always", write: "ask", delete: "ask", web_search: "always", browser_use: "ask" } as const,
  sessionGrants: {},
};

beforeEach(() => {
  chatStreamMock.mockReset();
  executeToolCallMock.mockReset();
  loggerErrorMock.mockReset();
});

describe("buildChatSSEResponse — error logging (E1)", () => {
  it("logs the failure with safe identifiers when the stream throws", async () => {
    chatStreamMock.mockImplementation(async function* () {
      throw new Error("provider exploded");
      // eslint-disable-next-line no-unreachable
      yield { type: "done" };
    });

    const res = buildChatSSEResponse({ ...baseParams } as never);
    const events = await collect(res);

    // Client still gets a friendly error chunk.
    expect(events.some((e) => e.type === "error")).toBe(true);

    // Server logged it exactly once.
    expect(loggerErrorMock).toHaveBeenCalledTimes(1);
    const [ctx, msg] = loggerErrorMock.mock.calls[0]!;
    expect(msg).toBe("chat stream failed");
    expect((ctx as { conversationId: string }).conversationId).toBe("conv-err-1");
    expect((ctx as { err: Error }).err).toBeInstanceOf(Error);

    // Never logs the prompt/message body.
    const serialized = JSON.stringify({ ctx: { conversationId: (ctx as { conversationId: string }).conversationId }, msg });
    expect(serialized).not.toContain("secret prompt body");
  });

  it("does NOT log when the stream completes successfully", async () => {
    chatStreamMock.mockImplementation(async function* () {
      yield { type: "text", content: "hello" };
      yield { type: "done" };
    });

    const res = buildChatSSEResponse({ ...baseParams } as never);
    await collect(res);

    expect(loggerErrorMock).not.toHaveBeenCalled();
  });
});
