import { describe, it, expect } from "vitest";
import { reduceTimeline } from "../chat-session-context";

describe("reduceTimeline scenario_activated (Plan 5)", () => {
  it("appends a scenario marker node", () => {
    const out = reduceTimeline([], { type: "scenario_activated", scenarioId: "s1", name: "Aggressive" });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "scenario", scenarioId: "s1", scenarioName: "Aggressive" });
  });

  it("ignores unrelated events for the scenario branch", () => {
    const out = reduceTimeline([], { type: "text", content: "hi" });
    expect(out[0]?.kind).toBe("result");
  });

  it("scenario_exited pushes a scenario node with null name", () => {
    const out = reduceTimeline([], { type: "scenario_exited" });
    expect(out.at(-1)).toMatchObject({ kind: "scenario", scenarioName: null });
  });
});
