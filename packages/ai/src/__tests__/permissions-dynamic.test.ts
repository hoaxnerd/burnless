import { describe, it, expect } from "vitest";
import { categorizeToolName, resolvePermission } from "../permissions";

const DEFAULTS = { read: "always", write: "ask", delete: "ask", web_search: "always", browser_use: "ask" } as const;

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

  it("resolvePermission uses dynamicCategories: MCP read auto-runs, write asks", () => {
    expect(
      resolvePermission("mcp__s__list", {
        defaults: DEFAULTS as never, sessionGrants: {},
        dynamicCategories: { mcp__s__list: "read" },
      })
    ).toBe("allow");
    expect(
      resolvePermission("mcp__s__send", {
        defaults: DEFAULTS as never, sessionGrants: {},
        dynamicCategories: { mcp__s__send: "write" },
      })
    ).toBe("ask");
  });

  it("write-mode read_only clamp denies MCP writes too", () => {
    expect(
      resolvePermission("mcp__s__send", {
        defaults: DEFAULTS as never, sessionGrants: {}, writeMode: "read_only",
        dynamicCategories: { mcp__s__send: "write" },
      })
    ).toBe("deny");
  });
});
