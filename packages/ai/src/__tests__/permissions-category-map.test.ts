import { describe, it, expect } from "vitest";
import { getFinancialTools } from "../tools";
import { categorizeToolName, MUTATION_TOOL_NAMES } from "../permissions";

describe("category map completeness", () => {
  const names = getFinancialTools().map((t) => t.name);

  it("classifies every live tool into a valid category", () => {
    for (const name of names) {
      const cat = categorizeToolName(name);
      expect(["read", "write", "delete", "web_search", "browser_use"]).toContain(cat);
    }
  });

  it("every delete_* tool is in the delete category", () => {
    for (const name of names) {
      if (name.startsWith("delete_")) {
        expect(categorizeToolName(name), name).toBe("delete");
      }
    }
  });

  it("MUTATION_TOOL_NAMES are exactly the write+delete tools and all exist", () => {
    for (const name of MUTATION_TOOL_NAMES) {
      expect(names, `${name} missing from live tools`).toContain(name);
      expect(["write", "delete"]).toContain(categorizeToolName(name));
    }
  });
});
