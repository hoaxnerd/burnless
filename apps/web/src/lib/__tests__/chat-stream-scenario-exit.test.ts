import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/ai-tools", () => ({
  executeToolCall: vi.fn(async () => JSON.stringify({ ok: true })),
  describeToolAction: vi.fn(() => ""),
  logDeniedToolCall: vi.fn(),
}));
vi.mock("@burnless/db", () => ({
  db: { insert: () => ({ values: async () => {} }), update: () => ({ set: () => ({ where: async () => {} }) }) },
  appendTurnEvent: vi.fn(async () => ({ id: "evt" })),
  aiConversations: {},
}));

import { scenarioExitFrom } from "../chat-stream";

describe("scenarioExitFrom", () => {
  it("detects a successful exit_scenario result", () => {
    expect(scenarioExitFrom("exit_scenario", JSON.stringify({ success: true, exited: true }))).toBe(true);
  });
  it("ignores other tools / failures", () => {
    expect(scenarioExitFrom("create_scenario", JSON.stringify({ success: true }))).toBe(false);
    expect(scenarioExitFrom("exit_scenario", JSON.stringify({ success: false }))).toBe(false);
    expect(scenarioExitFrom("exit_scenario", "not json")).toBe(false);
  });
});
