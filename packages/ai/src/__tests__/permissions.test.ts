import { describe, it, expect } from "vitest";
import {
  resolvePermission,
  categorizeToolName,
  BUILTIN_PERMISSION_DEFAULTS,
  type PermissionDefaults,
  type ResolvePermissionContext,
} from "../permissions";

const def = (over: Partial<PermissionDefaults> = {}): PermissionDefaults => ({
  ...BUILTIN_PERMISSION_DEFAULTS,
  ...over,
});

describe("categorizeToolName", () => {
  it("classifies each category", () => {
    expect(categorizeToolName("get_metrics")).toBe("read");
    expect(categorizeToolName("create_forecast_line")).toBe("write");
    expect(categorizeToolName("update_scenario")).toBe("write");
    expect(categorizeToolName("delete_scenario")).toBe("delete");
    expect(categorizeToolName("search_web")).toBe("web_search");
    expect(categorizeToolName("read_webpage")).toBe("web_search");
    expect(categorizeToolName("read_webpage_rendered")).toBe("browser_use");
  });
  it("defaults unknown tools to read", () => {
    expect(categorizeToolName("totally_unknown")).toBe("read");
  });
});

describe("resolvePermission", () => {
  it("reads + web search allow by default", () => {
    expect(resolvePermission("get_metrics", { defaults: def(), sessionGrants: {} })).toBe("allow");
    expect(resolvePermission("search_web", { defaults: def(), sessionGrants: {} })).toBe("allow");
  });

  it("writes, deletes, browser ask by default", () => {
    expect(resolvePermission("create_forecast_line", { defaults: def(), sessionGrants: {} })).toBe("ask");
    expect(resolvePermission("delete_scenario", { defaults: def(), sessionGrants: {} })).toBe("ask");
    expect(resolvePermission("read_webpage_rendered", { defaults: def(), sessionGrants: {} })).toBe("ask");
  });

  it("a session grant on the category allows", () => {
    expect(
      resolvePermission("create_forecast_line", { defaults: def(), sessionGrants: { write: true } })
    ).toBe("allow");
  });

  it("'always' default allows", () => {
    expect(
      resolvePermission("create_forecast_line", { defaults: def({ write: "always" }), sessionGrants: {} })
    ).toBe("allow");
  });

  it("'session' default with no grant yet still asks", () => {
    expect(
      resolvePermission("create_forecast_line", { defaults: def({ write: "session" }), sessionGrants: {} })
    ).toBe("ask");
  });

  it("delete never honors 'always' (clamped to ask)", () => {
    // Even if a bad value sneaks in, deletes never auto-allow via a standing default.
    expect(
      resolvePermission("delete_scenario", { defaults: def({ delete: "always" as never }), sessionGrants: {} })
    ).toBe("ask");
    // but a session grant still allows deletes
    expect(
      resolvePermission("delete_scenario", { defaults: def(), sessionGrants: { delete: true } })
    ).toBe("allow");
  });
});

const writeModeBase: ResolvePermissionContext = {
  defaults: { read: "always", write: "always", delete: "ask", web_search: "always", browser_use: "ask" },
  sessionGrants: { write: true, delete: true },
};

describe("writeMode clamp (spec §4.4)", () => {
  it("confirm forces a write to ask, overriding an 'always' default AND a session grant", () => {
    expect(resolvePermission("create_revenue_stream", { ...writeModeBase, writeMode: "confirm" })).toBe("ask");
  });

  it("confirm forces a delete to ask, overriding the session grant", () => {
    expect(resolvePermission("delete_revenue_stream", { ...writeModeBase, writeMode: "confirm" })).toBe("ask");
  });

  it("read_only denies writes and deletes (never executes)", () => {
    expect(resolvePermission("create_revenue_stream", { ...writeModeBase, writeMode: "read_only" })).toBe("deny");
    expect(resolvePermission("delete_revenue_stream", { ...writeModeBase, writeMode: "read_only" })).toBe("deny");
  });

  it("read_only still allows reads", () => {
    expect(resolvePermission("get_metrics", { ...writeModeBase, writeMode: "read_only" })).toBe("allow");
  });

  it("full preserves today's per-category resolution (grant → allow)", () => {
    expect(resolvePermission("create_revenue_stream", { ...writeModeBase, writeMode: "full" })).toBe("allow");
  });

  it("absent writeMode defaults to full (back-compat: existing callers unchanged)", () => {
    expect(resolvePermission("create_revenue_stream", writeModeBase)).toBe("allow");
  });

  it("read_only does not clamp web_search / browser_use (only write + delete)", () => {
    expect(resolvePermission("search_web", { ...writeModeBase, writeMode: "read_only" })).toBe("allow");
  });
});
