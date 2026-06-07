import { describe, it, expect } from "vitest";
import { GENUI_DISPLAY_TOOLS } from "../tools-genui";

describe("display tools accept confidence/rationale inputs (Plan 5)", () => {
  it("every show_* tool exposes optional confidence + rationale", () => {
    expect(GENUI_DISPLAY_TOOLS.length).toBeGreaterThan(0);
    for (const tool of GENUI_DISPLAY_TOOLS) {
      const props = (tool.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
      expect(props.confidence, `${tool.name} confidence`).toBeDefined();
      expect(props.rationale, `${tool.name} rationale`).toBeDefined();
      const conf = props.confidence as { enum?: string[] };
      expect(conf.enum).toEqual(["high", "low"]);
    }
  });

  it("does not mark confidence/rationale as required", () => {
    for (const tool of GENUI_DISPLAY_TOOLS) {
      const required = (tool.inputSchema as { required?: string[] }).required ?? [];
      expect(required).not.toContain("confidence");
      expect(required).not.toContain("rationale");
    }
  });
});
