import { describe, it, expect } from "vitest";
import {
  resolvePermission,
  categorizeToolName,
  BUILTIN_PERMISSION_DEFAULTS,
  type PermissionDefaults,
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
