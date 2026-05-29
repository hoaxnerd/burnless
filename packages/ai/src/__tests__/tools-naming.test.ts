import { describe, it, expect } from "vitest";
import { getFinancialTools } from "../tools";
import { TOOL_NAME_ALIASES } from "../tool-aliases";

const ALLOWED_PREFIXES = ["create_", "get_", "update_", "delete_"];
const WEB_TOOLS = new Set(["search_web", "read_webpage", "read_webpage_rendered"]);

describe("tool naming convention", () => {
  const tools = getFinancialTools();

  it("every tool follows the CRUD convention or is a known web tool", () => {
    for (const t of tools) {
      const ok = WEB_TOOLS.has(t.name) || ALLOWED_PREFIXES.some((p) => t.name.startsWith(p));
      expect(ok, `tool "${t.name}" violates the naming convention`).toBe(true);
    }
  });

  it("no retired name is still defined as a live tool", () => {
    const liveNames = new Set(tools.map((t) => t.name));
    for (const oldName of Object.keys(TOOL_NAME_ALIASES)) {
      expect(liveNames.has(oldName), `retired tool "${oldName}" is still defined`).toBe(false);
    }
  });

  it("the removed `search` tool is gone", () => {
    expect(tools.some((t) => t.name === "search")).toBe(false);
  });

  it("tool names are unique", () => {
    const names = tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
