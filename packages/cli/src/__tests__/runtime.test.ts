import { describe, expect, it } from "vitest";
import { LOCAL_VERBS, resolveRuntimeMode, topVerb, bareVerbOrDefault } from "../runtime";

describe("bareVerbOrDefault", () => {
  it("returns undefined for a bare invocation (no verb) — bare = help, not start", () => {
    expect(bareVerbOrDefault(["node", "burnless"])).toBeUndefined();
  });
  it("returns undefined for --help / --version", () => {
    expect(bareVerbOrDefault(["node", "burnless", "--help"])).toBeUndefined();
    expect(bareVerbOrDefault(["node", "burnless", "--version"])).toBeUndefined();
  });
  it("returns the verb when one is present", () => {
    expect(bareVerbOrDefault(["node", "burnless", "start"])).toBe("start");
    expect(bareVerbOrDefault(["node", "burnless", "health"])).toBe("health");
  });
});

describe("resolveRuntimeMode", () => {
  it("is thin only when BURNLESS_RUNTIME=thin", () => {
    expect(resolveRuntimeMode({ BURNLESS_RUNTIME: "thin" })).toBe("thin");
  });
  it("defaults to fat when unset (dev / artifact)", () => {
    expect(resolveRuntimeMode({})).toBe("fat");
  });
  it("treats any non-thin value as fat", () => {
    expect(resolveRuntimeMode({ BURNLESS_RUNTIME: "fat" })).toBe("fat");
    expect(resolveRuntimeMode({ BURNLESS_RUNTIME: "weird" })).toBe("fat");
  });
});

describe("topVerb", () => {
  it("returns the first non-flag token after node + script", () => {
    expect(topVerb(["node", "burnless", "start", "--port", "2876"])).toBe("start");
  });
  it("skips leading global flags", () => {
    expect(topVerb(["node", "burnless", "--json", "db", "migrate"])).toBe("db");
  });
  it("is undefined for a bare invocation", () => {
    expect(topVerb(["node", "burnless"])).toBeUndefined();
  });
  it("skips the value of --profile <name> before the verb", () => {
    expect(topVerb(["node", "burnless", "--profile", "work", "provider", "list"])).toBe("provider");
  });
  it("handles the self-contained --profile=name form", () => {
    expect(topVerb(["node", "burnless", "--profile=work", "db", "migrate"])).toBe("db");
  });
  it("preserves boolean-flag behavior (--json / --no-color)", () => {
    expect(topVerb(["node", "burnless", "--json", "--no-color", "start"])).toBe("start");
  });
  it("skips --profile value even amid other booleans", () => {
    expect(topVerb(["node", "burnless", "--json", "--profile", "work", "health"])).toBe("health");
  });
});

describe("LOCAL_VERBS", () => {
  it("contains the P1 local-instance verbs", () => {
    for (const v of ["start", "db", "health", "doctor", "bootstrap"]) {
      expect(LOCAL_VERBS.has(v)).toBe(true);
    }
  });
  it("does not contain remote-client verbs", () => {
    for (const v of ["login", "call", "status", "whoami", "mcp"]) {
      expect(LOCAL_VERBS.has(v)).toBe(false);
    }
  });
  it("includes the P2 local-instance verbs", () => {
    expect(LOCAL_VERBS.has("users")).toBe(true);
    expect(LOCAL_VERBS.has("config")).toBe(true);
  });
  it("includes the P3 provider verbs", () => {
    expect(LOCAL_VERBS.has("provider")).toBe(true);
    expect(LOCAL_VERBS.has("key")).toBe(true);
    expect(LOCAL_VERBS.has("model")).toBe(true);
  });
});
