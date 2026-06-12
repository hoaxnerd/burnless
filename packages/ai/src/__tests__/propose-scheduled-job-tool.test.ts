import { describe, it, expect } from "vitest";
import { GENUI_DISPLAY_TOOLS } from "../tools-genui";
import { MCP_SERVER_EXCLUDED_TOOLS, getFinancialTools } from "../tools";

describe("propose_scheduled_job tool", () => {
  it("is a registered genui display tool", () => {
    expect(GENUI_DISPLAY_TOOLS.some((t) => t.name === "propose_scheduled_job")).toBe(true);
  });
  it("is in the financial tool surface but EXCLUDED from MCP", () => {
    expect(getFinancialTools().some((t) => t.name === "propose_scheduled_job")).toBe(true);
    expect(MCP_SERVER_EXCLUDED_TOOLS.has("propose_scheduled_job")).toBe(true);
  });
  it("declares the draft fields the card renders", () => {
    const t = GENUI_DISPLAY_TOOLS.find((x) => x.name === "propose_scheduled_job")!;
    const props = t.inputSchema.properties as Record<string, unknown>;
    for (const k of ["name", "prompt", "schedule", "scheduleLabel", "actionKind", "whatItDoes", "dryRunPreview", "allowedTools"]) {
      expect(props[k]).toBeTruthy();
    }
  });
});
