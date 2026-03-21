import { test, expect } from "@playwright/test";

/**
 * Reports page E2E tests — verify all 8 report pages respond without 500.
 * Deeper content tests are gated behind DATABASE_URL for authenticated access.
 */

const reportPages = [
  { path: "/reports/board-update", name: "Board Update" },
  { path: "/reports/profit-loss", name: "Profit & Loss" },
  { path: "/reports/cash-flow", name: "Cash Flow" },
  { path: "/reports/balance-sheet", name: "Balance Sheet" },
  { path: "/reports/runway", name: "Runway Analysis" },
  { path: "/reports/budget-vs-actuals", name: "Budget vs Actuals" },
  { path: "/reports/metrics", name: "Metrics Explorer" },
  { path: "/reports/scenario-compare", name: "Scenario Comparison" },
];

test.describe("Report pages smoke tests", () => {
  for (const report of reportPages) {
    test(`${report.name} report page does not return 500`, async ({
      page,
    }) => {
      const response = await page.goto(report.path, { waitUntil: "commit" });
      expect(response?.status()).toBeLessThan(500);
    });
  }

  test("reports index page does not return 500", async ({ page }) => {
    const response = await page.goto("/reports", { waitUntil: "commit" });
    expect(response?.status()).toBeLessThan(500);
  });

  for (const report of reportPages) {
    test(`${report.name} report page redirects unauthenticated users`, async ({
      page,
    }) => {
      await page.goto(report.path, { waitUntil: "networkidle" });
      await expect(page).toHaveURL(/\/login/);
    });
  }
});
