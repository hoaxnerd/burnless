import { describe, it, expect } from "vitest";
import {
  buildSystemPrompt,
  buildSystemMessage,
  SYSTEM_PROMPT,
  AUTONOMOUS_SYSTEM_PROMPT,
} from "../prompts";

// Tokens that belong ONLY to interactive (live chat + UI) — they must be absent
// from the autonomous (headless cron) prompt, which has no user, no UI, and a
// frozen minimal tool allowlist.
const INTERACTIVE_ONLY = [
  "propose_plan",
  "PAUSE for approval",
  "show_metric_card",
  "show_line_chart",
  "request_input_form",
  "propose_scheduled_job",
  "ask a clarifying question",
  "Showing results with components",
];

// Tokens that belong ONLY to autonomous.
const AUTONOMOUS_ONLY = [
  "SCHEDULED AUTOMATION",
  "no live user",
  "frozen",
  "attempt a tool that was not provided to you",
  "plain text is your only and correct output",
];

// Shared CORE — present in BOTH modes.
const CORE_TOKENS = ["SaaS metrics", "Never fabricate financial data", "confidential", "Burnless AI"];

describe("prompt run modes", () => {
  it("interactive (default) carries the UI/approval/forms guidance", () => {
    const interactive = buildSystemPrompt("Companion", "interactive");
    expect(interactive).toBe(SYSTEM_PROMPT.replace(/\{\{COMPANION_NAME\}\}/g, "Companion"));
    for (const t of INTERACTIVE_ONLY) expect(interactive).toContain(t);
  });

  it("autonomous DROPS every interactive UI/approval/forms instruction", () => {
    const autonomous = buildSystemPrompt("Companion", "autonomous");
    for (const t of INTERACTIVE_ONLY) {
      expect(autonomous, `autonomous prompt must not contain "${t}"`).not.toContain(t);
    }
  });

  it("autonomous adds headless-run guidance (no user, frozen allowlist, plain-text summary)", () => {
    const autonomous = buildSystemPrompt("Companion", "autonomous");
    for (const t of AUTONOMOUS_ONLY) expect(autonomous).toContain(t);
  });

  it("both modes share the CORE (expertise, accuracy, security, identity)", () => {
    const interactive = buildSystemPrompt("Companion", "interactive");
    const autonomous = buildSystemPrompt("Companion", "autonomous");
    for (const t of CORE_TOKENS) {
      expect(interactive).toContain(t);
      expect(autonomous).toContain(t);
    }
  });

  it("substitutes the companion name in both modes", () => {
    expect(buildSystemPrompt("Athena", "interactive")).toContain("Athena");
    expect(buildSystemPrompt("Athena", "autonomous")).toContain("Athena");
    expect(buildSystemPrompt("Athena", "autonomous")).not.toContain("{{COMPANION_NAME}}");
  });

  it("buildSystemMessage threads the mode through", () => {
    const auto = buildSystemMessage("MRR: $10,000", "Companion", "autonomous");
    expect(auto).toContain("SCHEDULED AUTOMATION");
    expect(auto).not.toContain("propose_plan");
    expect(auto).toContain("MRR: $10,000");

    const inter = buildSystemMessage("MRR: $10,000", "Companion"); // default interactive
    expect(inter).toContain("propose_plan");
    expect(inter).not.toContain("SCHEDULED AUTOMATION");
  });

  it("the exported AUTONOMOUS_SYSTEM_PROMPT matches autonomous mode", () => {
    expect(buildSystemPrompt("Companion", "autonomous")).toBe(
      AUTONOMOUS_SYSTEM_PROMPT.replace(/\{\{COMPANION_NAME\}\}/g, "Companion"),
    );
  });
});
