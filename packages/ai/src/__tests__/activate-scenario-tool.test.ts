import { describe, it, expect } from "vitest";
import { getFinancialTools } from "../tools";
import { categorizeToolName } from "../permissions";

describe("activate_scenario tool (Plan 5)", () => {
  it("is registered with a required scenarioId", () => {
    const t = getFinancialTools().find((x) => x.name === "activate_scenario");
    expect(t).toBeDefined();
    const schema = t!.inputSchema as { properties: Record<string, unknown>; required?: string[] };
    expect(schema.properties.scenarioId).toBeDefined();
    expect(schema.required).toContain("scenarioId");
  });

  it("classifies as read (no permission gate — view-only control)", () => {
    expect(categorizeToolName("activate_scenario")).toBe("read");
  });
});
