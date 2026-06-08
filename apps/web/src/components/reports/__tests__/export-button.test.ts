/**
 * RPT-11: statementToCSVRows must build the header-month UNION across ALL
 * sections (not just sections[0]) and default any missing month cell to numeric
 * 0 — matching the UI table's zero fallback. Transaction-only sections (e.g.
 * COGS) have shorter values arrays; previously their later months exported as
 * blank cells. CSV writes raw numbers (engine never formats), so 0 is correct.
 */

import { describe, it, expect } from "vitest";
import { statementToCSVRows } from "../export-button";

describe("statementToCSVRows (RPT-11)", () => {
  it("returns a single Item column for empty sections", () => {
    expect(statementToCSVRows([])).toEqual({ headers: ["Item"], data: [] });
  });

  it("builds the header-month UNION across all sections", () => {
    const { headers } = statementToCSVRows([
      {
        name: "Revenue",
        values: [
          { month: "2025-01", value: 100 },
          { month: "2025-02", value: 200 },
          { month: "2025-03", value: 300 },
        ],
      },
      {
        // COGS only has actuals for the first two months
        name: "COGS",
        values: [
          { month: "2025-01", value: 40 },
          { month: "2025-02", value: 50 },
        ],
      },
    ]);
    expect(headers).toEqual(["Item", "2025-01", "2025-02", "2025-03"]);
  });

  it("includes months that appear ONLY in a later section, in first-seen order", () => {
    const { headers } = statementToCSVRows([
      { name: "A", values: [{ month: "2025-01", value: 1 }] },
      {
        name: "B",
        values: [
          { month: "2025-01", value: 2 },
          { month: "2025-02", value: 3 },
        ],
      },
    ]);
    expect(headers).toEqual(["Item", "2025-01", "2025-02"]);
  });

  it("defaults missing month cells to numeric 0 (not undefined / blank)", () => {
    const { data } = statementToCSVRows([
      {
        name: "Revenue",
        values: [
          { month: "2025-01", value: 100 },
          { month: "2025-02", value: 200 },
          { month: "2025-03", value: 300 },
        ],
      },
      {
        name: "COGS",
        values: [
          { month: "2025-01", value: 40 },
          { month: "2025-02", value: 50 },
        ],
      },
    ]);

    const cogsRow = data.find((r) => r.Item === "COGS")!;
    // The third month was absent from COGS — must be 0, not undefined.
    expect(cogsRow["2025-03"]).toBe(0);
    expect(cogsRow["2025-03"]).not.toBeUndefined();
    // Existing values are preserved.
    expect(cogsRow["2025-01"]).toBe(40);
    expect(cogsRow["2025-02"]).toBe(50);
  });

  it("renders 0 (not blank) when serialized to a CSV cell", () => {
    const { headers, data } = statementToCSVRows([
      { name: "Revenue", values: [{ month: "2025-01", value: 100 }, { month: "2025-02", value: 200 }] },
      { name: "COGS", values: [{ month: "2025-01", value: 40 }] },
    ]);
    const cogsRow = data.find((r) => r.Item === "COGS")!;
    const cell = String(cogsRow[headers[2]!] ?? "");
    expect(cell).toBe("0");
    expect(cell).not.toBe("");
  });
});
