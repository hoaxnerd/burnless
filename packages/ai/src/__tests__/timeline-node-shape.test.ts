import { describe, it, expect } from "vitest";
import type { TimelineNode } from "../generative-ui";

describe("TimelineNode rich gate + scenario shape (Plan 5)", () => {
  it("permits a scenario marker node", () => {
    const n: TimelineNode = { id: "sc-1", kind: "scenario", scenarioId: "s1", scenarioName: "Aggressive" };
    expect(n.kind).toBe("scenario");
  });

  it("permits a rich resolved plan gate node", () => {
    const n: TimelineNode = {
      id: "p1", kind: "plan",
      plan: { pauseId: "p1", conversationId: "cv1", spec: { title: "x", steps: [] }, resolved: true },
    };
    expect(n.plan?.resolved).toBe(true);
  });

  it("permits a rich diff_gate node with actions", () => {
    const n: TimelineNode = {
      id: "g1", kind: "diff_gate",
      pending: { pauseId: "g1", conversationId: "cv1", actions: [], resolved: false },
    };
    expect(n.pending?.actions).toEqual([]);
  });
});
