// apps/web/src/lib/__tests__/chat-stream-turn-events.test.ts
//
// Task 2.2 — dual-write of per-step turn-log events (assistant_step / executed
// tool_result / scenario / hard-stop stopped tool_result / turn_done / turn_error)
// alongside the existing aiMessages writes. Asserts via the appendTurnEvent mock.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { chatStreamMock, appendTurnEventMock, insertedMessages } = vi.hoisted(() => ({
  chatStreamMock: vi.fn(),
  appendTurnEventMock: vi.fn(async (_e: unknown) => ({ id: "evt" })),
  insertedMessages: [] as Array<{ content: string; metadata?: unknown }>,
}));

vi.mock("@burnless/ai", async (orig) => {
  const actual = await orig<typeof import("@burnless/ai")>();
  return { ...actual, chatStream: chatStreamMock };
});

vi.mock("@burnless/db", async (orig) => {
  const actual = await orig<typeof import("@burnless/db")>();
  return {
    ...actual,
    appendTurnEvent: (e: unknown) => appendTurnEventMock(e),
    createPendingAction: vi.fn(async () => ({ id: "row-1" })),
    updatePendingActionTimeline: vi.fn(async () => {}),
    db: {
      insert: () => ({ values: (v: { content: string; metadata?: unknown }) => { insertedMessages.push(v); return Promise.resolve(); } }),
      update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    },
  };
});

// show_metric_card → render envelope; everything else → plain JSON result.
vi.mock("@/lib/ai-tools", () => ({
  executeToolCall: vi.fn(async (tool: string) =>
    tool === "show_metric_card"
      ? JSON.stringify({ render: { component: "metric_card", props: { label: "Runway", value: 14.2 } }, modelResult: "[metric_card shown]" })
      : JSON.stringify({ ok: true })
  ),
  describeToolAction: () => "desc",
}));

import { buildChatSSEResponse } from "../chat-stream";

async function drain(res: Response): Promise<void> {
  const reader = res.body!.getReader();
  for (;;) { const { done } = await reader.read(); if (done) break; }
}

type Append = { type: string; turnId: string; payload: Record<string, unknown> };
const appends = (): Append[] => appendTurnEventMock.mock.calls.map((c) => c[0] as unknown as Append);
const ofType = (t: string): Append[] => appends().filter((a) => a.type === t);

const baseParams = {
  companyId: "c1", userId: "u1", scenarioId: "s1", writeScenarioId: null, conversationId: "conv1",
  turnId: "turn-1",
  messages: [{ role: "user" as const, content: "go" }],
  financialContext: "ctx", companionName: "Companion", providerConfig: undefined,
  defaults: { read: "always", write: "always", delete: "always", web_search: "always", browser_use: "always" } as const,
  sessionGrants: {},
};

beforeEach(() => { chatStreamMock.mockReset(); appendTurnEventMock.mockClear(); insertedMessages.length = 0; });

describe("buildChatSSEResponse — dual-write turn events (Task 2.2)", () => {
  it("display-tool turn: assistant_step + executed tool_result with terse result AND render", async () => {
    chatStreamMock.mockImplementation(async function* (opts: { onToolCall: (t: string, i: Record<string, unknown>) => Promise<string> }) {
      // The model thread step arrives BEFORE its tools run.
      yield { type: "assistant_step", text: "showing runway", toolUses: [{ id: "tu-1", name: "show_metric_card", input: { foo: 1 } }] };
      const r = await opts.onToolCall("show_metric_card", { foo: 1 });
      // The model gets the terse modelResult, not the render props.
      expect(r).toBe("[metric_card shown]");
      // chat.ts also yields the executed tool_result chunk (kind undefined).
      yield { type: "tool_result", toolName: "show_metric_card", toolResult: r, nodeId: "tu-1", nodeKind: "tool" };
      yield { type: "done" };
    });
    await drain(buildChatSSEResponse({ ...baseParams } as never));

    const step = ofType("assistant_step");
    expect(step).toHaveLength(1);
    expect(step[0]!.payload.text).toBe("showing runway");
    expect((step[0]!.payload.toolUses as { id: string }[])[0]!.id).toBe("tu-1");

    const tr = ofType("tool_result");
    expect(tr).toHaveLength(1); // exactly once — no double-append
    expect(tr[0]!.payload.toolUseId).toBe("tu-1"); // SAME id space as assistant_step
    expect(tr[0]!.payload.kind).toBe("executed");
    expect(tr[0]!.payload.result).toBe("[metric_card shown]"); // terse, NOT render props
    expect((tr[0]!.payload.render as { component: string }).component).toBe("metric_card");
    expect((tr[0]!.payload.render as { props: { value: number } }).props.value).toBe(14.2);

    expect(ofType("turn_done")).toHaveLength(1);
    // All appends carry the threaded turnId.
    expect(appends().every((a) => a.turnId === "turn-1")).toBe(true);
  });

  it("data-tool turn: executed tool_result carries raw result, no render, exactly once", async () => {
    chatStreamMock.mockImplementation(async function* (opts: { onToolCall: (t: string, i: Record<string, unknown>) => Promise<string> }) {
      yield { type: "assistant_step", toolUses: [{ id: "tu-9", name: "update_thing", input: {} }] };
      const r = await opts.onToolCall("update_thing", {});
      yield { type: "tool_result", toolName: "update_thing", toolResult: r, nodeId: "tu-9", nodeKind: "tool" };
      yield { type: "done" };
    });
    await drain(buildChatSSEResponse({ ...baseParams } as never));

    const tr = ofType("tool_result");
    expect(tr).toHaveLength(1);
    expect(tr[0]!.payload.toolUseId).toBe("tu-9");
    expect(tr[0]!.payload.kind).toBe("executed");
    expect(tr[0]!.payload.result).toBe(JSON.stringify({ ok: true }));
    expect(tr[0]!.payload.render).toBeUndefined();
  });

  it("hard-stop turn: writes kind:'stopped' tool_result for every trailing tool_use", async () => {
    chatStreamMock.mockImplementation(async function* () {
      yield { type: "assistant_step", toolUses: [{ id: "s1", name: "loopy" }, { id: "s2", name: "loopy" }] };
      // Synthesized stopped results (never go through onToolCall).
      yield { type: "tool_result", toolName: "loopy", toolResult: "stop msg", nodeId: "s1", nodeKind: "tool", kind: "stopped" };
      yield { type: "tool_result", toolName: "loopy", toolResult: "stop msg", nodeId: "s2", nodeKind: "tool", kind: "stopped" };
      yield { type: "done" };
    });
    await drain(buildChatSSEResponse({ ...baseParams } as never));

    const tr = ofType("tool_result");
    expect(tr).toHaveLength(2);
    expect(tr.every((a) => a.payload.kind === "stopped")).toBe(true);
    expect(tr.map((a) => a.payload.toolUseId).sort()).toEqual(["s1", "s2"]);
    // Stopped path never invoked onToolCall → no "executed" appended.
    expect(tr.some((a) => a.payload.kind === "executed")).toBe(false);
  });

  it("scenario activation runs through onToolCall and appends a scenario event", async () => {
    const { executeToolCall } = await import("@/lib/ai-tools");
    (executeToolCall as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(async () =>
      JSON.stringify({ success: true, scenarioId: "sc-new", name: "Aggressive Hiring" }),
    );
    chatStreamMock.mockImplementation(async function* (opts: { onToolCall: (t: string, i: Record<string, unknown>) => Promise<string> }) {
      yield { type: "assistant_step", toolUses: [{ id: "tu-sc", name: "create_scenario", input: {} }] };
      const r = await opts.onToolCall("create_scenario", {});
      yield { type: "tool_result", toolName: "create_scenario", toolResult: r, nodeId: "tu-sc", nodeKind: "tool" };
      yield { type: "done" };
    });
    await drain(buildChatSSEResponse({ ...baseParams } as never));

    const sc = ofType("scenario");
    expect(sc).toHaveLength(1);
    expect(sc[0]!.payload).toMatchObject({ action: "activated", scenarioId: "sc-new", name: "Aggressive Hiring" });
  });

  it("permission pause: appends deferred result (exactly once, no dup of executed) then the gate", async () => {
    // Batch: one executed write (tu-x) + one same-batch tool deferred to the pause
    // (tu-y, synthesized {deferred:true} in completedResults — never via onToolCall).
    chatStreamMock.mockImplementation(async function* (opts: { onToolCall: (t: string, i: Record<string, unknown>) => Promise<string>; onPause: (s: unknown) => Promise<string> }) {
      yield { type: "assistant_step", toolUses: [{ id: "tu-x", name: "update_a", input: {} }, { id: "tu-y", name: "delete_b", input: {} }] };
      const r = await opts.onToolCall("update_a", {});
      yield { type: "tool_result", toolName: "update_a", toolResult: r, nodeId: "tu-x", nodeKind: "tool" };
      // The model now requests delete_b which gates → pause.
      await opts.onPause({
        assistantBlocks: [],
        completedResults: [
          { type: "tool_result", toolUseId: "tu-x", content: r }, // executed (already appended)
          { type: "tool_result", toolUseId: "tu-y", content: JSON.stringify({ declined: true, message: "blocked" }) },
        ],
        pending: [{ requestId: "tu-z", toolName: "delete_b", toolInput: {} }],
      });
      yield { type: "permission_request", pauseId: "pause-1", actions: [] };
      yield { type: "paused", pauseId: "pause-1" };
    });
    await drain(buildChatSSEResponse({ ...baseParams } as never));

    const tr = ofType("tool_result");
    // tu-x executed (onToolCall) + tu-y declined (pause). NO duplicate of tu-x.
    expect(tr).toHaveLength(2);
    const byId = Object.fromEntries(tr.map((a) => [a.payload.toolUseId, a.payload.kind]));
    expect(byId["tu-x"]).toBe("executed");
    expect(byId["tu-y"]).toBe("declined");

    const gate = ofType("gate");
    expect(gate).toHaveLength(1);
    // pauseId is minted inside onPause (crypto.randomUUID), not the chunk pauseId.
    expect(typeof gate[0]!.payload.pauseId).toBe("string");
    expect((gate[0]!.payload.pauseId as string).length).toBeGreaterThan(0);
    expect(gate[0]!.payload.kind).toBe("permission");
    expect(gate[0]!.payload.scenarioId).toBe("s1");
    expect(gate[0]!.payload.writeScenarioId).toBeNull();
    expect(gate[0]!.turnId).toBe("turn-1");

    // Ordering: the deferred/declined result is appended BEFORE the gate.
    const seq = appends().map((a) => a.type);
    expect(seq.indexOf("tool_result")).toBeLessThan(seq.indexOf("gate"));
    // gate is unresolved (no resolvedAt on append).
  });

  it("plan pause: appends gate kind:'plan' with the spec, deferred results, no executed dup", async () => {
    chatStreamMock.mockImplementation(async function* (opts: { onPlanRequest: (s: unknown) => Promise<string> }) {
      yield { type: "assistant_step", toolUses: [{ id: "p-1", name: "propose_plan", input: {} }, { id: "w-1", name: "update_a", input: {} }] };
      await opts.onPlanRequest({
        assistantBlocks: [],
        completedResults: [
          { type: "tool_result", toolUseId: "w-1", content: JSON.stringify({ deferred: true, message: "later" }) },
        ],
        planToolUseId: "p-1",
        spec: { title: "Plan" },
      });
      yield { type: "plan_request", pauseId: "pp-1", plan: { title: "Plan" } };
      yield { type: "paused", pauseId: "pp-1" };
    });
    await drain(buildChatSSEResponse({ ...baseParams } as never));

    const tr = ofType("tool_result");
    expect(tr).toHaveLength(1);
    expect(tr[0]!.payload.toolUseId).toBe("w-1");
    expect(tr[0]!.payload.kind).toBe("deferred");

    const gate = ofType("gate");
    expect(gate).toHaveLength(1);
    expect(gate[0]!.payload.kind).toBe("plan");
    expect((gate[0]!.payload.spec as { title: string }).title).toBe("Plan");
  });

  it("error chunk appends a turn_error", async () => {
    chatStreamMock.mockImplementation(async function* () {
      yield { type: "error", content: "boom" };
    });
    await drain(buildChatSSEResponse({ ...baseParams } as never));
    const err = ofType("turn_error");
    expect(err).toHaveLength(1);
    expect(err[0]!.payload.message).toBe("boom");
  });

  it("a thrown stream appends a turn_error (catch path)", async () => {
    chatStreamMock.mockImplementation(async function* () {
      yield { type: "text", content: "" };
      throw new Error("kaboom");
    });
    await drain(buildChatSSEResponse({ ...baseParams } as never));
    const err = ofType("turn_error");
    expect(err).toHaveLength(1);
    expect(err[0]!.payload.message).toBe("kaboom");
  });
});
