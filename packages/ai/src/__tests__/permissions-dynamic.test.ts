import { describe, it, expect } from "vitest";
import { categorizeToolName, resolvePermission, type PermissionDefaults } from "../permissions";

// Typed (not `as never`) so drift in the PermissionDefaults shape fails loudly here.
const DEFAULTS: PermissionDefaults = {
  read: "always",
  write: "ask",
  delete: "ask",
  web_search: "always",
  browser_use: "ask",
};

describe("dynamic categories (MCP, spec §3.4)", () => {
  it("categorizeToolName consults the dynamic map first", () => {
    expect(categorizeToolName("mcp__stripe__list_invoices", { mcp__stripe__list_invoices: "read" })).toBe("read");
    expect(categorizeToolName("mcp__stripe__refund", { mcp__stripe__refund: "delete" })).toBe("delete");
  });

  it("unknown MCP tools default to write (safe-by-default), not read", () => {
    expect(categorizeToolName("mcp__x__anything")).toBe("write");
  });

  it("non-MCP unknown tools still default to read (existing behavior unchanged)", () => {
    expect(categorizeToolName("show_metric_card")).toBe("read");
  });

  it("the dynamic lookup is prototype-safe: Object.prototype members never leak as categories", () => {
    // A hallucinated tool name matching an Object.prototype member must NOT
    // return that member ("constructor" → Function) as the category.
    expect(categorizeToolName("constructor", {})).toBe("read");
    expect(categorizeToolName("toString", { mcp__s__list: "read" })).toBe("read");
    expect(categorizeToolName("hasOwnProperty", {})).toBe("read");
    // And an mcp__-prefixed prototype-ish name still falls through to write-by-default.
    expect(categorizeToolName("mcp__s__refund", { constructor: "read" } as never)).toBe("write");
  });

  it("resolvePermission uses dynamicCategories: MCP read auto-runs, write asks", () => {
    expect(
      resolvePermission("mcp__s__list", {
        defaults: DEFAULTS, sessionGrants: {},
        dynamicCategories: { mcp__s__list: "read" },
      })
    ).toBe("allow");
    expect(
      resolvePermission("mcp__s__send", {
        defaults: DEFAULTS, sessionGrants: {},
        dynamicCategories: { mcp__s__send: "write" },
      })
    ).toBe("ask");
  });

  it("write-mode read_only clamp denies MCP writes too", () => {
    expect(
      resolvePermission("mcp__s__send", {
        defaults: DEFAULTS, sessionGrants: {}, writeMode: "read_only",
        dynamicCategories: { mcp__s__send: "write" },
      })
    ).toBe("deny");
  });
});
