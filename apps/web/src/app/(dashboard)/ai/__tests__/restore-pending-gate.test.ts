// AI-09: a restored pending gate is LIVE only when resumable; a stale historical
// gate is restored INERT (resolved) so the composer (computeAwaitingDecision)
// stays enabled. The genuinely-just-paused resume path stays untouched.
import { describe, it, expect } from "vitest";
import { restoreConversationMessages, computeAwaitingDecision } from "../awaiting-decision";
import type { Message, PendingPermission, PendingPlan, TimelineNodeClient } from "../_components/types";

const baseMessages: Message[] = [
  { role: "user", content: "do a thing", createdAt: Date.now() },
  { role: "assistant", content: "on it", createdAt: Date.now(), timeline: [] },
];

const pendingPermission: PendingPermission = {
  pauseId: "pause-1",
  conversationId: "c1",
  actions: [{ requestId: "r1", tool: "create_scenario", category: "write", description: "create scenario", input: {} }],
};

function lastTimeline(msgs: Message[]): TimelineNodeClient[] {
  return msgs[msgs.length - 1]!.timeline ?? [];
}

describe("restoreConversationMessages (AI-09)", () => {
  it("resumable:false → gate restored RESOLVED + composer enabled", () => {
    const msgs = restoreConversationMessages(baseMessages, {
      pendingPermission,
      resumable: false,
    });
    const gate = lastTimeline(msgs).find((n) => n.kind === "diff_gate")!;
    expect(gate).toBeDefined();
    expect(gate.resolved).toBe(true);
    expect(gate.pending?.resolved).toBe(true);
    // Composer must NOT be locked by a stale, resolved gate.
    expect(computeAwaitingDecision(msgs)).toBe(false);
  });

  it("resumable:true → gate restored LIVE + composer locked (resume path intact)", () => {
    const msgs = restoreConversationMessages(baseMessages, {
      pendingPermission,
      resumable: true,
    });
    const gate = lastTimeline(msgs).find((n) => n.kind === "diff_gate")!;
    expect(gate).toBeDefined();
    expect(gate.resolved).toBeUndefined();
    expect(gate.pending?.resolved).toBeUndefined();
    // A live diff_gate locks the composer.
    expect(computeAwaitingDecision(msgs)).toBe(true);
  });

  it("resumable:false on a pendingTimeline full-run marks gate nodes resolved", () => {
    const pendingTimeline: TimelineNodeClient[] = [
      { id: "t1", kind: "result", text: "lead-up" },
      { id: "pause-1", kind: "diff_gate", pending: pendingPermission },
    ];
    const msgs = restoreConversationMessages(baseMessages, { pendingTimeline, resumable: false });
    const gate = lastTimeline(msgs).find((n) => n.kind === "diff_gate")!;
    expect(gate.resolved).toBe(true);
    expect(computeAwaitingDecision(msgs)).toBe(false);
  });

  it("resumable:true on a pendingTimeline full-run keeps the gate live", () => {
    const pendingTimeline: TimelineNodeClient[] = [
      { id: "t1", kind: "result", text: "lead-up" },
      { id: "pause-1", kind: "diff_gate", pending: pendingPermission },
    ];
    const msgs = restoreConversationMessages(baseMessages, { pendingTimeline, resumable: true });
    expect(computeAwaitingDecision(msgs)).toBe(true);
  });

  it("a stale plan gate restores resolved (and plans never lock anyway)", () => {
    const pendingPlan: PendingPlan = { pauseId: "plan-1", conversationId: "c1", spec: { title: "Plan", steps: [] } };
    const msgs = restoreConversationMessages(baseMessages, { pendingPlan, resumable: false });
    const planNode = lastTimeline(msgs).find((n) => n.kind === "plan")!;
    expect(planNode.plan?.resolved).toBe(true);
    expect(computeAwaitingDecision(msgs)).toBe(false);
  });

  it("no pending gate → returns the restored messages unchanged", () => {
    const msgs = restoreConversationMessages(baseMessages, { resumable: false });
    expect(msgs).toEqual(baseMessages);
  });
});
