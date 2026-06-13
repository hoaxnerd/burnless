import { describe, expect, it } from "vitest";
import { LOCAL_VERBS, resolveRuntimeMode, topVerb } from "../runtime";

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
});
