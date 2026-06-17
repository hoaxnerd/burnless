import { describe, it, expect } from "vitest";
import { buildSystemMessage } from "../prompts";

describe("scenario-context snippet", () => {
  it("included when scenario tools are present (interactive)", () => {
    const msg = buildSystemMessage("CTX", "Companion", "interactive", true);
    expect(msg).toContain("exit_scenario");
    expect(msg).toContain("activate_scenario");
  });
  it("omitted when scenario tools absent", () => {
    const msg = buildSystemMessage("CTX", "Companion", "interactive", false);
    expect(msg).not.toContain("exit_scenario");
  });
  it("omitted in autonomous mode regardless of flag", () => {
    const msg = buildSystemMessage("CTX", "Companion", "autonomous", true);
    expect(msg).not.toContain("exit_scenario");
  });
});
