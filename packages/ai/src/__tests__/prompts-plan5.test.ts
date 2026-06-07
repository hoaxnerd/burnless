import { describe, it, expect } from "vitest";
import { SYSTEM_PROMPT, buildSystemPrompt } from "../prompts";

describe("Plan 5 prompt conventions", () => {
  it("instructs propose_plan before writes/multi-step and to skip it for simple reads", () => {
    expect(SYSTEM_PROMPT).toContain("## Planning before acting");
    expect(SYSTEM_PROMPT).toContain("propose_plan");
    // Must tell the model NOT to plan a simple read (gemma over-calls it today).
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("do not call propose_plan");
  });

  it("instructs the binary confidence + rationale convention", () => {
    expect(SYSTEM_PROMPT).toContain("confidence");
    expect(SYSTEM_PROMPT).toContain("rationale");
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("because you");
  });

  it("still substitutes the companion name", () => {
    expect(buildSystemPrompt("Athena")).toContain("Athena");
    expect(buildSystemPrompt("Athena")).not.toContain("{{COMPANION_NAME}}");
  });
});
