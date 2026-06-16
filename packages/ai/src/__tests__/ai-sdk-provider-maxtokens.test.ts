import { describe, it, expect, afterEach } from "vitest";
import { resolveMaxOutputTokens } from "../providers/ai-sdk-provider";

afterEach(() => { delete process.env.BURNLESS_AI_MAX_OUTPUT_TOKENS; });

describe("resolveMaxOutputTokens", () => {
  it("request value wins", () => { expect(resolveMaxOutputTokens(1000, 500)).toBe(1000); });
  it("config value next", () => { expect(resolveMaxOutputTokens(undefined, 500)).toBe(500); });
  it("env default 0 -> undefined (uncapped)", () => { expect(resolveMaxOutputTokens(undefined, undefined)).toBeUndefined(); });
  it("explicit env cap is honored", () => {
    process.env.BURNLESS_AI_MAX_OUTPUT_TOKENS = "3000";
    expect(resolveMaxOutputTokens(undefined, undefined)).toBe(3000);
  });
});
