import { describe, it, expect } from "vitest";
import { projectTimeline } from "../project-timeline";
import type { TurnEvent } from "../types";
const ev = (seq: number, type: TurnEvent["type"], payload: any, resolvedAt: Date | null = null): TurnEvent => ({
  id: `e${seq}`, conversationId: "c", seq, turnId: seq < 4 ? "t1" : "t2", type, payload, resolvedAt, createdAt: new Date(0),
});

describe("projectTimeline", () => {
  it("groups timeline + uiBlocks per assistant turn into separate Messages", () => {
    const events: TurnEvent[] = [
      ev(1, "user_message", { text: "hi" }),
      ev(2, "assistant_step", { text: "working", toolUses: [{ id: "u1", name: "create_scenario", input: {} }] }),
      ev(3, "tool_result", { toolUseId: "u1", toolName: "create_scenario", result: "{}", kind: "executed" }),
      ev(4, "scenario", { action: "activated", scenarioId: "s", name: "S" }),
      ev(5, "turn_done", {}),
    ];
    const { messages, openGate } = projectTimeline(events);
    expect(openGate).toBeNull();
    expect(messages[0]).toMatchObject({ role: "user", content: "hi" });
    const asst = messages[1]!;
    expect(asst.role).toBe("assistant");
    expect(asst.timeline!.some((n) => n.kind === "tool" && n.toolName === "create_scenario")).toBe(true);
    expect(asst.timeline!.some((n) => n.kind === "scenario" && n.scenarioName === "S")).toBe(true);
  });

  it("surfaces a display tool_result as a uiBlock on its turn", () => {
    const events: TurnEvent[] = [
      ev(1, "user_message", { text: "show" }),
      ev(2, "assistant_step", { toolUses: [{ id: "d", name: "show_metric_card", input: {} }] }),
      ev(3, "tool_result", { toolUseId: "d", toolName: "show_metric_card", result: "[shown]", kind: "executed",
        render: { component: "MetricCard", props: { value: 42 } } }),
      ev(4, "turn_done", {}),
    ];
    const asst = projectTimeline(events).messages.find((m) => m.role === "assistant")!;
    expect(asst.uiBlocks!.some((b) => b.component === "MetricCard")).toBe(true);
  });

  it("surfaces the single open gate as the live card", () => {
    const events: TurnEvent[] = [
      ev(1, "user_message", { text: "go" }),
      ev(2, "assistant_step", { toolUses: [{ id: "u1", name: "delete_scenario", input: { id: "x" } }] }),
      ev(3, "gate", { pauseId: "p1", kind: "permission", actions: [{ requestId: "u1", tool: "delete_scenario" }], scenarioId: "s", writeScenarioId: null }, null),
    ];
    const { openGate } = projectTimeline(events);
    expect(openGate).toMatchObject({ pauseId: "p1", kind: "permission" });
  });
});
