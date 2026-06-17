import { describe, it, expect, afterEach } from "vitest";
import { getAiLimits } from "../config";

const KEYS = [
  "BURNLESS_AI_MAX_TOOL_ITERATIONS",
  "BURNLESS_AI_MAX_OUTPUT_TOKENS",
  "BURNLESS_AI_REPEAT_SOFT_LIMIT",
  "BURNLESS_AI_REPEAT_HARD_LIMIT",
  "BURNLESS_AI_ONBOARDING_MAX_LOOPS",
];
afterEach(() => { for (const k of KEYS) delete process.env[k]; });

describe("getAiLimits", () => {
  it("returns defaults when env unset", () => {
    expect(getAiLimits()).toEqual({
      maxToolIterations: 25,
      maxOutputTokens: 0,
      repeatSoftLimit: 3,
      repeatHardLimit: 5,
      onboardingMaxLoops: 50,
    });
  });

  it("reads valid overrides", () => {
    process.env.BURNLESS_AI_MAX_TOOL_ITERATIONS = "40";
    process.env.BURNLESS_AI_ONBOARDING_MAX_LOOPS = "70";
    const l = getAiLimits();
    expect(l.maxToolIterations).toBe(40);
    expect(l.onboardingMaxLoops).toBe(70);
  });

  it("falls back on non-finite / below-min values", () => {
    process.env.BURNLESS_AI_MAX_TOOL_ITERATIONS = "abc";
    process.env.BURNLESS_AI_REPEAT_SOFT_LIMIT = "0";
    const l = getAiLimits();
    expect(l.maxToolIterations).toBe(25);
    expect(l.repeatSoftLimit).toBe(3);
  });

  it("allows 0 for output tokens (uncapped)", () => {
    process.env.BURNLESS_AI_MAX_OUTPUT_TOKENS = "0";
    expect(getAiLimits().maxOutputTokens).toBe(0);
    process.env.BURNLESS_AI_MAX_OUTPUT_TOKENS = "2048";
    expect(getAiLimits().maxOutputTokens).toBe(2048);
  });

  it("coerces hard < soft so hard >= soft", () => {
    process.env.BURNLESS_AI_REPEAT_SOFT_LIMIT = "6";
    process.env.BURNLESS_AI_REPEAT_HARD_LIMIT = "4";
    const l = getAiLimits();
    expect(l.repeatSoftLimit).toBe(6);
    expect(l.repeatHardLimit).toBe(6);
  });
});
