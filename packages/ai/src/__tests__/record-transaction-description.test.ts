import { describe, it, expect } from "vitest";
import { getFinancialTools } from "../tools";

describe("record_transaction tool description (§3)", () => {
  it("tells the model transactions write the BASE actuals ledger and not to record while a scenario is active", () => {
    const tools = getFinancialTools();
    const rt = tools.find((t) => t.name === "record_transaction");
    expect(rt).toBeDefined();
    const desc = rt!.description.toLowerCase();
    expect(desc).toContain("base");
    expect(desc).toContain("actuals");
    expect(desc).toMatch(/scenario/);
  });
});
