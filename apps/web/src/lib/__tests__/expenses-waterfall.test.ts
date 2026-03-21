/**
 * Expenses page waterfall regression test — BUR-198
 *
 * Verifies the expenses page fetches budget scenario data in parallel
 * with other data (Promise.all), not sequentially (waterfall pattern).
 *
 * Reference: commit 78842bb fixed the original waterfall, commit 9e113d5
 * further improved it by moving budget scenario into Promise.all.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const expensesSource = readFileSync(
  join(import.meta.dirname, "../../app/(dashboard)/expenses/page.tsx"),
  "utf-8"
);

describe("expenses page waterfall prevention (BUR-198 regression)", () => {
  it("should use Promise.all for parallel data fetching", () => {
    expect(expensesSource).toContain("Promise.all");
  });

  it("should fetch budget scenario in the Promise.all batch", () => {
    // The Promise.all should include getBudgetScenario
    const promiseAllBlock = expensesSource.match(
      /Promise\.all\(\[[\s\S]*?\]\)/
    );
    expect(promiseAllBlock).not.toBeNull();
    expect(promiseAllBlock![0]).toContain("getBudgetScenario");
  });

  it("should fetch computeDashboardData in the Promise.all batch", () => {
    const promiseAllBlock = expensesSource.match(
      /Promise\.all\(\[[\s\S]*?\]\)/
    );
    expect(promiseAllBlock).not.toBeNull();
    expect(promiseAllBlock![0]).toContain("computeDashboardData");
  });

  it("should fetch getAccounts in the Promise.all batch", () => {
    const promiseAllBlock = expensesSource.match(
      /Promise\.all\(\[[\s\S]*?\]\)/
    );
    expect(promiseAllBlock).not.toBeNull();
    expect(promiseAllBlock![0]).toContain("getAccounts");
  });

  it("should fetch computeExpenseDetails in the Promise.all batch", () => {
    const promiseAllBlock = expensesSource.match(
      /Promise\.all\(\[[\s\S]*?\]\)/
    );
    expect(promiseAllBlock).not.toBeNull();
    expect(promiseAllBlock![0]).toContain("computeExpenseDetails");
  });

  it("should NOT have sequential awaits for dashboard and budget data before rendering", () => {
    // Ensure we don't have patterns like:
    //   const data = await computeDashboardData(...);
    //   const budgetData = await computeDashboardData(...);
    // This would be a waterfall regression
    const lines = expensesSource.split("\n");
    const awaitDashLines = lines.filter(
      (l) =>
        l.includes("await computeDashboardData") &&
        !l.includes("Promise.all") &&
        !l.includes("budgetDataPromise")
    );
    // There should be at most the budgetDataPromise await (which is deferred)
    // No direct sequential await on computeDashboardData outside Promise.all
    expect(awaitDashLines.length).toBe(0);
  });

  it("should use Suspense boundary for async content", () => {
    expect(expensesSource).toContain("<Suspense");
    expect(expensesSource).toContain("fallback=");
  });
});
