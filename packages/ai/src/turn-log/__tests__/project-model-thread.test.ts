import { describe, it, expect } from "vitest";
import { projectModelThread } from "../project-model-thread";
import type { TurnEvent } from "../types";

const ev = (seq: number, type: TurnEvent["type"], payload: any): TurnEvent => ({
  id: `e${seq}`, conversationId: "c", seq, turnId: "t1", type, payload, resolvedAt: null, createdAt: new Date(0),
});

describe("projectModelThread", () => {
  it("maps user + assistant(text+toolUses) + batched tool_results into provider messages", () => {
    const events: TurnEvent[] = [
      ev(1, "user_message", { text: "hi" }),
      ev(2, "assistant_step", { text: "ok", toolUses: [{ id: "u1", name: "list_scenarios", input: {} }] }),
      ev(3, "tool_result", { toolUseId: "u1", toolName: "list_scenarios", result: "{\"scenarios\":[]}", kind: "executed" }),
      ev(4, "assistant_step", { text: "done" }),
      ev(5, "turn_done", {}),
    ];
    expect(projectModelThread(events)).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: [{ type: "text", text: "ok" }, { type: "tool_use", id: "u1", name: "list_scenarios", input: {} }] },
      { role: "user", content: [{ type: "tool_result", toolUseId: "u1", content: "{\"scenarios\":[]}" }] },
      { role: "assistant", content: [{ type: "text", text: "done" }] },
    ]);
  });

  it("collapses a maximal run of tool_results (deferred + executed, even across a gate) into ONE user turn", () => {
    const events: TurnEvent[] = [
      ev(1, "user_message", { text: "go" }),
      ev(2, "assistant_step", { toolUses: [{ id: "a", name: "create_revenue_stream", input: {} }, { id: "b", name: "create_headcount", input: {} }] }),
      ev(3, "tool_result", { toolUseId: "a", toolName: "create_revenue_stream", result: "{}", kind: "deferred" }),
      ev(4, "gate", { pauseId: "p", kind: "permission", scenarioId: "s", writeScenarioId: null }),
      ev(5, "tool_result", { toolUseId: "b", toolName: "create_headcount", result: "{\"ok\":true}", kind: "executed" }),
    ];
    const thread = projectModelThread(events);
    expect(thread[1]).toEqual({ role: "assistant", content: [
      { type: "tool_use", id: "a", name: "create_revenue_stream", input: {} },
      { type: "tool_use", id: "b", name: "create_headcount", input: {} },
    ]});
    expect(thread[2]).toEqual({ role: "user", content: [
      { type: "tool_result", toolUseId: "a", content: "{}" },
      { type: "tool_result", toolUseId: "b", content: "{\"ok\":true}" },
    ]});
    expect(thread).toHaveLength(3);
  });

  it("uses the model-facing `result` verbatim for display tools (never render props)", () => {
    const events: TurnEvent[] = [
      ev(1, "assistant_step", { toolUses: [{ id: "d", name: "show_metric_card", input: {} }] }),
      ev(2, "tool_result", { toolUseId: "d", toolName: "show_metric_card", result: "[metric card shown]", kind: "executed",
        render: { component: "MetricCard", props: { value: 42 } } }),
    ];
    const userTurn = projectModelThread(events)[1] as { content: any[] };
    expect(userTurn.content[0].content).toBe("[metric card shown]");
    expect(JSON.stringify(userTurn)).not.toContain("MetricCard");
  });

  it("skips scenario/gate/turn_* control events", () => {
    const events: TurnEvent[] = [
      ev(1, "user_message", { text: "x" }),
      ev(2, "scenario", { action: "activated", scenarioId: "s", name: "S" }),
      ev(3, "turn_done", {}),
    ];
    expect(projectModelThread(events)).toEqual([{ role: "user", content: "x" }]);
  });
});
