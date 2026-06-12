// packages/ai/src/__tests__/builtin-tool-control.test.ts
import { describe, it, expect } from "vitest";
import { listBuiltinToolsForControl, categorizeToolName } from "../permissions";
import { DISPLAY_TOOL_NAMES, INPUT_TOOL_NAMES, PLAN_TOOL_NAMES } from "../generative-ui";

describe("listBuiltinToolsForControl()", () => {
  const controls = listBuiltinToolsForControl();
  const names = controls.map((c) => c.name);

  it("returns a non-empty, deduplicated list of built-in tool names", () => {
    expect(controls.length).toBeGreaterThan(0);
    expect(new Set(names).size).toBe(names.length);
  });

  it("excludes display/genui/input/plan tools and mcp__* tools", () => {
    for (const n of names) {
      expect(DISPLAY_TOOL_NAMES.has(n)).toBe(false);
      expect(INPUT_TOOL_NAMES.has(n)).toBe(false);
      expect(PLAN_TOOL_NAMES.has(n)).toBe(false);
      expect(n.startsWith("mcp__")).toBe(false);
    }
  });

  it("categorizes each tool consistently with categorizeToolName", () => {
    for (const c of controls) {
      expect(c.category).toBe(categorizeToolName(c.name));
    }
  });

  it("includes representative read, write, delete, and web_search tools", () => {
    expect(names).toContain("get_metrics"); // read
    expect(names).toContain("record_transaction"); // write
    expect(names).toContain("delete_forecast_line"); // delete
    expect(names).toContain("search_web"); // web_search
  });
});
