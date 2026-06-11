import { describe, expect, it } from "vitest";
import { formatResult, renderTable } from "../render";

describe("renderTable", () => {
  it("aligns columns and uppercases headers (no trailing pad on last column)", () => {
    const out = renderTable([
      { name: "a", value: 1 },
      { name: "bb", value: 22 },
    ]);
    expect(out).toBe(["NAME  VALUE", "----  -----", "a     1", "bb    22"].join("\n"));
  });

  it("renders '(no rows)' for an empty list", () => {
    expect(renderTable([])).toBe("(no rows)");
  });

  it("stringifies object cells and blanks null/undefined", () => {
    const out = renderTable([{ k: { a: 1 }, v: null }]);
    expect(out).toContain('{"a":1}');
    expect(out.split("\n")[2]).not.toContain("null");
  });

  it("unions keys across rows", () => {
    const out = renderTable([{ a: 1 }, { b: 2 }]);
    expect(out).toContain("A");
    expect(out).toContain("B");
  });
});

describe("formatResult", () => {
  it("renders a JSON array of objects as a table", () => {
    const out = formatResult(JSON.stringify([{ id: "x", mrr: 100 }]));
    expect(out).toContain("ID");
    expect(out).toContain("MRR");
    expect(out).toContain("100");
  });

  it("renders a JSON object as key/value rows", () => {
    const out = formatResult(JSON.stringify({ mrr: 1200, runwayMonths: 14 }));
    expect(out).toContain("mrr");
    expect(out).toContain("1200");
    expect(out).toContain("runwayMonths");
  });

  it("passes non-JSON text through untouched", () => {
    expect(formatResult("plain sentence")).toBe("plain sentence");
  });
});
