// AI-02: a lone unresolved PLAN node must NOT lock the composer (advisory,
// two-gates contract), while an unresolved diff_gate / input MUST.
import { describe, it, expect } from "vitest";
import { computeAwaitingDecision } from "../awaiting-decision";
import type { Message } from "../_components/types";

const assistant = (timeline: Message["timeline"]): Message => ({
  role: "assistant",
  content: "",
  createdAt: Date.now(),
  timeline,
});

describe("computeAwaitingDecision (AI-02)", () => {
  it("a lone unresolved plan node does NOT lock the composer", () => {
    const msgs: Message[] = [
      assistant([
        { id: "p1", kind: "plan", plan: { pauseId: "p1", conversationId: "c1", spec: { title: "Plan", steps: [] } } },
      ]),
    ];
    expect(computeAwaitingDecision(msgs)).toBe(false);
  });

  it("an unresolved diff_gate DOES lock the composer", () => {
    const msgs: Message[] = [
      assistant([
        {
          id: "g1",
          kind: "diff_gate",
          pending: { pauseId: "g1", conversationId: "c1", actions: [] },
        },
      ]),
    ];
    expect(computeAwaitingDecision(msgs)).toBe(true);
  });

  it("an unresolved input gate DOES lock the composer", () => {
    const msgs: Message[] = [
      assistant([
        {
          id: "i1",
          kind: "input",
          input: { pauseId: "i1", conversationId: "c1", spec: { title: "Form", fields: [] } },
        },
      ]),
    ];
    expect(computeAwaitingDecision(msgs)).toBe(true);
  });

  it("a resolved diff_gate does NOT lock the composer", () => {
    const msgs: Message[] = [
      assistant([
        {
          id: "g1",
          kind: "diff_gate",
          pending: { pauseId: "g1", conversationId: "c1", actions: [], resolved: true },
        },
      ]),
    ];
    expect(computeAwaitingDecision(msgs)).toBe(false);
  });

  it("a pending permission (legacy bubble field) still locks the composer", () => {
    const msgs: Message[] = [
      { role: "assistant", content: "", createdAt: Date.now(), pendingPermission: { pauseId: "x", conversationId: "c1", actions: [] } },
    ];
    expect(computeAwaitingDecision(msgs)).toBe(true);
  });
});
