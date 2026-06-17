import { describe, it, expect, afterEach, vi } from "vitest";

// Isolate the pure loop-bound helper from the agent's transitive import chain
// (`@/lib/ai-tools` → next/server), matching provider-resolution.test.ts.
vi.mock("@/lib/ai-tools", () => ({ executeToolCall: vi.fn() }));
vi.mock("@/lib/ai-feature-flags", () => ({ getCompanyProviderConfig: vi.fn() }));

import { getOnboardingMaxLoops } from "../index";

afterEach(() => { delete process.env.BURNLESS_AI_ONBOARDING_MAX_LOOPS; });

describe("onboarding loop bound", () => {
  it("defaults to 50", () => { expect(getOnboardingMaxLoops()).toBe(50); });
  it("honors env override", () => {
    process.env.BURNLESS_AI_ONBOARDING_MAX_LOOPS = "30";
    expect(getOnboardingMaxLoops()).toBe(30);
  });
});
