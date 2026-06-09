/**
 * RPT-06: the board "largest category" narrative must skip the Uncategorized
 * catch-all (picking the largest NAMED category instead), and surface a
 * categorize-this prompt when Uncategorized dominates.
 *
 * RPT-10: the board's data-room CTA must read "Open Data Room" (navigation),
 * not "Export Package" with a Download icon (which implied an export).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { generateExpenseNarrative } from "../board-update-view";

type Expenses = Parameters<typeof generateExpenseNarrative>[0];

function makeExpenses(topCategories: Array<{ subcategory: string; amount: number; percentage: number }>): Expenses {
  return {
    current: 100_000,
    previous: 100_000,
    changePercent: 0,
    topCategories: topCategories as Expenses["topCategories"],
    anomalyCount: 0,
  } as Expenses;
}

describe("generateExpenseNarrative (RPT-06)", () => {
  it("names the largest NAMED category, never 'Uncategorized', when uncategorized is #1", () => {
    const narrative = generateExpenseNarrative(
      makeExpenses([
        { subcategory: "Uncategorized", amount: 49_000, percentage: 49 },
        { subcategory: "Payroll", amount: 30_000, percentage: 30 },
        { subcategory: "Software", amount: 21_000, percentage: 21 },
      ])
    );
    expect(narrative).toMatch(/Largest category: Payroll/);
    expect(narrative).not.toMatch(/Largest category: Uncategorized/);
  });

  it("surfaces a categorize prompt when uncategorized exceeds the threshold", () => {
    const narrative = generateExpenseNarrative(
      makeExpenses([
        { subcategory: "Uncategorized", amount: 49_000, percentage: 49 },
        { subcategory: "Payroll", amount: 51_000, percentage: 51 },
      ])
    );
    expect(narrative.toLowerCase()).toContain("uncategorized");
    expect(narrative.toLowerCase()).toContain("categorize");
  });

  it("does NOT show the categorize prompt for a small uncategorized share", () => {
    const narrative = generateExpenseNarrative(
      makeExpenses([
        { subcategory: "Payroll", amount: 90_000, percentage: 90 },
        { subcategory: "Uncategorized", amount: 10_000, percentage: 10 },
      ])
    );
    expect(narrative.toLowerCase()).not.toContain("categorize for a sharper");
    expect(narrative).toMatch(/Largest category: Payroll/);
  });

  it("matches 'Uncategorized' case-insensitively", () => {
    const narrative = generateExpenseNarrative(
      makeExpenses([
        { subcategory: "uncategorized", amount: 60_000, percentage: 60 },
        { subcategory: "Hosting", amount: 40_000, percentage: 40 },
      ])
    );
    expect(narrative).toMatch(/Largest category: Hosting/);
  });
});

describe("board data-room CTA (RPT-10)", () => {
  const source = readFileSync(
    join(__dirname, "..", "board-update-view.tsx"),
    "utf8"
  );

  it("labels the /data-room link 'Open Data Room', not 'Export Package'", () => {
    expect(source).toContain("Open Data Room");
    expect(source).not.toContain("Export Package");
  });

  it("does not use a Download icon on the data-room CTA", () => {
    // The Download lucide icon implied an export; it must be gone from this file.
    expect(source).not.toMatch(/<Download\b/);
  });
});
