import { test, expect } from "@playwright/test";

/**
 * Report Pages E2E Tests — BUR-248
 *
 * Tests individual report pages load and render correctly:
 *   - Profit & Loss
 *   - Cash Flow
 *   - Balance Sheet
 *   - Runway Analysis
 *   - Budget vs Actuals
 *   - Metrics Explorer
 *   - Scenario Comparison
 *   - Board Update (extended from edit-delete-entries.spec.ts)
 */

const dbAvailable = !!process.env.DATABASE_URL;

test.describe("Report pages — authenticated", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("Profit & Loss report loads with heading", async ({ page }) => {
    await page.goto("/reports/profit-loss");

    await expect(
      page.getByRole("heading", { name: /profit.+loss|p&l|income statement/i }).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("Profit & Loss shows financial line items", async ({ page }) => {
    await page.goto("/reports/profit-loss");

    await expect(
      page.getByRole("heading", { name: /profit.+loss|p&l|income statement/i }).first()
    ).toBeVisible({ timeout: 15_000 });

    // Should show standard P&L rows
    const lineItems = ["Revenue", "Gross Profit", "Operating Expenses", "Net Income"];
    for (const item of lineItems) {
      await expect(
        page.getByText(item, { exact: false }).first()
      ).toBeVisible({ timeout: 5_000 });
    }
  });

  test("Profit & Loss shows dollar amounts", async ({ page }) => {
    await page.goto("/reports/profit-loss");

    await expect(
      page.locator("text=/\\$[\\d,.]+/").first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("Cash Flow report loads with heading", async ({ page }) => {
    await page.goto("/reports/cash-flow");

    await expect(
      page.getByRole("heading", { name: /cash flow/i }).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("Cash Flow shows flow categories", async ({ page }) => {
    await page.goto("/reports/cash-flow");

    await expect(
      page.getByRole("heading", { name: /cash flow/i }).first()
    ).toBeVisible({ timeout: 15_000 });

    // Cash flow categories
    await expect(
      page.getByText(/operating|operations/i).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("Balance Sheet report loads with heading", async ({ page }) => {
    await page.goto("/reports/balance-sheet");

    await expect(
      page.getByRole("heading", { name: /balance sheet/i }).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("Balance Sheet shows asset/liability sections", async ({ page }) => {
    await page.goto("/reports/balance-sheet");

    await expect(
      page.getByRole("heading", { name: /balance sheet/i }).first()
    ).toBeVisible({ timeout: 15_000 });

    await expect(page.getByText(/assets/i).first()).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByText(/liabilities/i).first()).toBeVisible();
  });

  test("Runway Analysis report loads with heading", async ({ page }) => {
    await page.goto("/reports/runway");

    await expect(
      page.getByRole("heading", { name: /runway/i }).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("Runway shows months remaining", async ({ page }) => {
    await page.goto("/reports/runway");

    await expect(
      page.getByRole("heading", { name: /runway/i }).first()
    ).toBeVisible({ timeout: 15_000 });

    // Should show month count
    await expect(
      page.getByText(/month/i).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("Budget vs Actuals report loads with heading", async ({ page }) => {
    await page.goto("/reports/budget-vs-actuals");

    await expect(
      page.getByRole("heading", { name: /budget/i }).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("Metrics Explorer report loads with heading", async ({ page }) => {
    await page.goto("/reports/metrics");

    await expect(
      page.getByRole("heading", { name: /metrics/i }).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("Scenario Comparison report loads with heading", async ({ page }) => {
    await page.goto("/reports/scenario-compare");

    await expect(
      page.getByRole("heading", { name: /scenario/i }).first()
    ).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Report pages — no 500 errors", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  const reportPaths = [
    "/reports/profit-loss",
    "/reports/cash-flow",
    "/reports/balance-sheet",
    "/reports/runway",
    "/reports/metrics",
    "/reports/budget-vs-actuals",
    "/reports/scenario-compare",
    "/reports/board-update",
  ];

  for (const path of reportPaths) {
    test(`${path} does not return 500`, async ({ page }) => {
      const response = await page.goto(path, { waitUntil: "commit" });
      expect(
        response?.status(),
        `${path} returned server error`
      ).toBeLessThan(500);
    });
  }
});

test.describe("Report pages — print and export", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("Board Update has Print button", async ({ page }) => {
    await page.goto("/reports/board-update");

    await expect(
      page.getByRole("heading", { name: "Board Update" })
    ).toBeVisible({ timeout: 15_000 });

    await expect(
      page.locator("button", { hasText: "Print" })
    ).toBeVisible();
  });

  test("Board Update has Export Package link", async ({ page }) => {
    await page.goto("/reports/board-update");

    await expect(
      page.getByRole("heading", { name: "Board Update" })
    ).toBeVisible({ timeout: 15_000 });

    await expect(
      page.locator("a", { hasText: "Export Package" })
    ).toBeVisible();
  });
});

test.describe("Report pages — mobile viewport", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({
    storageState: "e2e/.auth/user.json",
    viewport: { width: 375, height: 812 },
  });

  test("Profit & Loss renders on mobile", async ({ page }) => {
    await page.goto("/reports/profit-loss");
    await expect(
      page.getByRole("heading", { name: /profit.+loss|p&l/i }).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("Board Update renders on mobile", async ({ page }) => {
    await page.goto("/reports/board-update");
    await expect(
      page.getByRole("heading", { name: "Board Update" })
    ).toBeVisible({ timeout: 15_000 });
  });
});
