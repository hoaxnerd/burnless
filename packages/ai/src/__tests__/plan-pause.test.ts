import { describe, it, expect } from "vitest";
import {
  isPlanTool,
  buildPlanSpec,
  PLAN_TOOL_NAMES,
} from "../generative-ui";
import { categorizeToolName } from "../permissions";

describe("plan tool set", () => {
  it("recognizes propose_plan", () => {
    expect(isPlanTool("propose_plan")).toBe(true);
    expect(isPlanTool("create_scenario")).toBe(false);
    expect(PLAN_TOOL_NAMES.has("propose_plan")).toBe(true);
  });

  it("propose_plan classifies as read (no permission card)", () => {
    expect(categorizeToolName("propose_plan")).toBe("read");
  });

  it("builds a plan spec, coercing steps and dropping malformed ones", () => {
    const spec = buildPlanSpec("propose_plan", {
      title: "Model a hire",
      description: "Add a hire, recompute runway",
      steps: [
        { kind: "tool", title: "Add hire", toolName: "create_headcount", toolInput: { title: "Eng" }, rationale: "needed", confidence: "high" },
        { kind: "note", title: "Then recompute runway" },
        { nonsense: true },
        "bad",
      ],
    });
    expect(spec.title).toBe("Model a hire");
    expect(spec.steps).toHaveLength(2);
    expect(spec.steps[0]).toMatchObject({ kind: "tool", toolName: "create_headcount", confidence: "high" });
    expect(spec.steps[0]!.id).toBeTruthy();
    expect(spec.steps[1]).toMatchObject({ kind: "note", title: "Then recompute runway" });
  });

  it("defaults title and coerces a missing/!array steps to []", () => {
    const spec = buildPlanSpec("propose_plan", { steps: "nope" });
    expect(spec.title).toBe("Plan");
    expect(spec.steps).toEqual([]);
  });

  it("throws for an unknown plan tool name", () => {
    expect(() => buildPlanSpec("not_a_plan", {})).toThrow(/unknown plan tool/i);
  });
});
