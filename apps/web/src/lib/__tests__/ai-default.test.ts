import { describe, it, expect, beforeEach } from "vitest";
import { initialAiMasterEnabled } from "../ai-default";

describe("initialAiMasterEnabled", () => {
  beforeEach(() => { delete process.env.BURNLESS_DEPLOYMENT; });
  it("defaults AI ON for self_host (degrades gracefully if no provider; never persists a false for a missing key)", () => {
    expect(initialAiMasterEnabled()).toBe(true);
  });
  it("defaults AI ON for cloud", () => {
    process.env.BURNLESS_DEPLOYMENT = "cloud";
    expect(initialAiMasterEnabled()).toBe(true);
  });
});
