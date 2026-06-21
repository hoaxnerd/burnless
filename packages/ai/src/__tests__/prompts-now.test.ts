import { describe, it, expect } from "vitest";
import { buildSystemMessage } from "../prompts";

describe("buildSystemMessage — current time injection", () => {
  const now = { iso: "2026-06-21T20:34 (Saturday)", timezone: "Asia/Kolkata" };
  it("injects the current date/time and timezone when nowContext is given", () => {
    const msg = buildSystemMessage("CTX", "Companion", "interactive", false, now);
    expect(msg).toContain("Current date and time");
    expect(msg).toContain("2026-06-21T20:34 (Saturday)");
    expect(msg).toContain("Asia/Kolkata");
  });
  it("injects time for autonomous runs too", () => {
    const msg = buildSystemMessage("CTX", "Companion", "autonomous", false, now);
    expect(msg).toContain("Asia/Kolkata");
  });
  it("omits the time section when nowContext is absent (back-compat)", () => {
    const msg = buildSystemMessage("CTX");
    expect(msg).not.toContain("Current date and time");
  });
});
