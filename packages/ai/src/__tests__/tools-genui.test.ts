import { describe, it, expect } from "vitest";
import { getFinancialTools } from "../tools";
import { DISPLAY_TOOL_NAMES, INPUT_TOOL_NAMES } from "../generative-ui";

describe("genui display tool defs", () => {
  it("every DISPLAY_TOOL_NAMES entry is advertised with a valid schema", () => {
    const defs = new Map(getFinancialTools().map((t) => [t.name, t]));
    for (const name of DISPLAY_TOOL_NAMES) {
      const def = defs.get(name);
      expect(def, `missing tool def: ${name}`).toBeTruthy();
      expect(def!.inputSchema.type).toBe("object");
      expect(def!.description.length).toBeGreaterThan(10);
    }
  });
});

describe("genui input tool defs", () => {
  it("every INPUT_TOOL_NAMES entry is advertised with a valid schema", () => {
    const defs = new Map(getFinancialTools().map((t) => [t.name, t]));
    for (const name of INPUT_TOOL_NAMES) {
      const def = defs.get(name);
      expect(def, `missing input tool def: ${name}`).toBeTruthy();
      expect(def!.inputSchema.type).toBe("object");
    }
  });

  it("advertises no duplicate tool names", () => {
    const names = getFinancialTools().map((t) => t.name);
    expect(names.length).toBe(new Set(names).size);
  });
});
