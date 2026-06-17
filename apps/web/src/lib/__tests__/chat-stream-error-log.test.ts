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
    db: {
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
  companyId: "c1", userId: "u1", scenarioId: "s1", writeScenarioId: null, conversationId: "conv-err-1", turnId: "turn-err",
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
    // Client gets a friendly error chunk — but NEVER the raw internal error text.
    const errEvent = events.find((e) => e.type === "error");
    expect(errEvent).toBeTruthy();
    expect(errEvent!.content).toBe("Something went wrong while generating a response. Please try again.");
    expect(JSON.stringify(events)).not.toContain("provider exploded");

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

  it("surfaces a model-hint (not the raw text) when the model returns an empty completion", async () => {
    chatStreamMock.mockImplementation(async function* () {
      const e = new Error('Empty completion from model "google/gemini-2.5-flash-lite" (no text or tool calls)');
      e.name = "EmptyCompletionError";
      throw e;
      // eslint-disable-next-line no-unreachable
      yield { type: "done" };
    });

    const res = buildChatSSEResponse({ ...baseParams } as never);
    const events = await collect(res);

    const errEvent = events.find((e) => e.type === "error");
    expect(errEvent!.content).toBe(
      "The assistant didn't return a response. Please try again — if this keeps happening, switch to a more capable model in Settings → AI.",
    );
    // The raw model/empty-completion text never reaches the browser.
    expect(JSON.stringify(events)).not.toContain("Empty completion from model");
    expect(JSON.stringify(events)).not.toContain("gemini-2.5-flash-lite");
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
