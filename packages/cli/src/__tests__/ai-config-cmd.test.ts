import { describe, expect, it } from "vitest";
import { assertLocalProfile, isLocalProfile } from "../commands/ai-config";
import { UsageError } from "../errors";

describe("isLocalProfile", () => {
  it("treats loopback hosts as local", () => {
    expect(isLocalProfile("http://127.0.0.1:2876")).toBe(true);
    expect(isLocalProfile("http://localhost:3000")).toBe(true);
    expect(isLocalProfile("http://[::1]:2876")).toBe(true);
  });
  it("treats a remote URL as not local", () => {
    expect(isLocalProfile("https://app.burnless.example")).toBe(false);
  });
});

describe("assertLocalProfile", () => {
  it("throws a deferral UsageError for a remote profile", () => {
    expect(() => assertLocalProfile("https://app.burnless.example")).toThrow(UsageError);
  });
  it("does not throw for local", () => {
    expect(() => assertLocalProfile("http://127.0.0.1:2876")).not.toThrow();
  });
});
