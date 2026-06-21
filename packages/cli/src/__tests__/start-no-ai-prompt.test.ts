// packages/cli/src/__tests__/start-no-ai-prompt.test.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

describe("burnless start — no first-run AI prompt", () => {
  const src = readFileSync(join(__dirname, "../commands/start.ts"), "utf8");
  it("does not import the first-run AI helper", () => {
    expect(src).not.toContain("first-run-ai");
    expect(src).not.toContain("shouldOfferAiSetup");
    expect(src).not.toContain("runFirstRunAiSetup");
  });
  it("does not prompt to configure an AI provider", () => {
    expect(src).not.toMatch(/Configure an AI provider/i);
  });
});
