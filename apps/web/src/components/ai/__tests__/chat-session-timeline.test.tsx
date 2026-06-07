// apps/web/src/components/ai/__tests__/chat-session-timeline.test.tsx
import { describe, it, expect } from "vitest";
import { reduceTimeline } from "../chat-session-context";

describe("reduceTimeline (worklog Plan 4)", () => {
  it("streams text into a trailing result node", () => {
    let t = reduceTimeline([], { type: "text", content: "Hello " });
    t = reduceTimeline(t, { type: "text", content: "world" });
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ kind: "result", text: "Hello world" });
  });

  it("tool_use pushes a tool node; tool_status updates it by nodeId", () => {
    let t = reduceTimeline([], { type: "tool_use", tool: "show_runway", nodeId: "tu-1" });
    t = reduceTimeline(t, { type: "tool_status", tool: "show_runway", phase: "running", nodeId: "tu-1" });
    t = reduceTimeline(t, { type: "tool_status", tool: "show_runway", phase: "done", nodeId: "tu-1" });
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ kind: "tool", toolName: "show_runway", phase: "done" });
  });

  it("a tool then a ui_component yields a tool node + a result block node in order", () => {
    let t = reduceTimeline([], { type: "tool_use", tool: "show_runway", nodeId: "tu-1" });
    t = reduceTimeline(t, { type: "ui_component", id: "b1", component: "runway", props: { months: 12 }, confidence: "high" });
    expect(t.map((n) => n.kind)).toEqual(["tool", "result"]);
    expect(t[1]).toMatchObject({ kind: "result", block: { component: "runway" }, confidence: "high" });
  });

  it("permission_request pushes a diff_gate node hydrated with its actions", () => {
    const t = reduceTimeline([], { type: "permission_request", pauseId: "p1", conversationId: "c1", actions: [{ requestId: "r", tool: "create_revenue_stream", category: "write", description: "d", input: {}, override: [{ action: "create", entityType: "revenue_stream", entityId: "x", before: null, after: { name: "X" } }] }] });
    expect(t[0]).toMatchObject({ kind: "diff_gate", pending: { pauseId: "p1" } });
    expect(t[0]!.pending!.actions[0]!.override).toBeTruthy();
  });

  it("plan_request + input_request push plan/input nodes", () => {
    const p = reduceTimeline([], { type: "plan_request", pauseId: "pp", conversationId: "c1", plan: { title: "T", steps: [] } });
    expect(p[0]).toMatchObject({ kind: "plan", plan: { pauseId: "pp" } });
    const i = reduceTimeline([], { type: "input_request", pauseId: "pi", conversationId: "c1", spec: { title: "F", fields: [] } });
    expect(i[0]).toMatchObject({ kind: "input", input: { pauseId: "pi" } });
  });
});
