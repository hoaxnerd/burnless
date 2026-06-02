import { describe, it, expect } from "vitest";
import { getFinancialTools } from "../tools";
import { DISPLAY_TOOL_NAMES } from "../generative-ui";

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
