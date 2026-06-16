import { describe, it, expect } from "vitest";
import { getFinancialTools, SCENARIO_TARGETABLE_TOOLS } from "../tools";

describe("scenarioId param injection", () => {
  it("adds optional scenarioId to overlay write tools", () => {
    const tools = getFinancialTools();
    const create = tools.find((t) => t.name === "create_revenue_stream")!;
    expect(create.inputSchema.properties).toHaveProperty("scenarioId");
    expect(create.inputSchema.required ?? []).not.toContain("scenarioId");
  });
  it("does NOT add it to scenario CRUD or base-table writers", () => {
    const tools = getFinancialTools();
    for (const name of ["create_scenario", "delete_scenario", "record_transaction"]) {
      const t = tools.find((x) => x.name === name)!;
      expect(t.inputSchema.properties).not.toHaveProperty("scenarioId");
    }
    expect(SCENARIO_TARGETABLE_TOOLS.has("create_scenario")).toBe(false);
  });
});
