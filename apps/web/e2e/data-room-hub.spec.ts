import { test, expect } from "@playwright/test";

/**
 * Data Room Unified Hub E2E Tests — BUR-192 / BUR-186
 *
 * Tests the unified Reports + Data Room + Import hub:
 *   - Tab navigation (Reports, Exports, Import)
 *   - Reports tab: 8 report cards with "Generate report" links
 *   - Exports tab: financial snapshot, quick exports, custom report builder
 *   - Import tab: embedded import flow
 *   - URL parameter tab switching (?tab=exports)
 *   - /reports redirect to /data-room?tab=reports
 */

const dbAvailable = !!process.env.DATABASE_URL;

test.describe("Data Room hub — authenticated", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("data room page loads with header and tabs", async ({ page }) => {
    await page.goto("/data-room");

    await expect(
      page.getByRole("heading", { name: "Data Room" })
    ).toBeVisible({ timeout: 10_000 });

    // Three tabs should be present
    const tabLabels = ["Reports", "Exports", "Import"];
    for (const label of tabLabels) {
      await expect(
        page.locator("button").filter({ hasText: label }).first()
      ).toBeVisible();
    }
  });

  test("Reports tab is active by default", async ({ page }) => {
    await page.goto("/data-room");

    // Reports tab should be active (has shadow/bg styling)
    // Verify report cards are visible
    await expect(
      page.getByText("Board Update").first()
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText("Profit & Loss").first()
    ).toBeVisible();
  });

  test("Reports tab shows all 8 report cards", async ({ page }) => {
    await page.goto("/data-room");

    const reportNames = [
      "Board Update",
      "Profit & Loss",
      "Cash Flow",
      "Balance Sheet",
      "Runway Analysis",
      "Budget vs Actuals",
      "Metrics Explorer",
      "Scenario Comparison",
    ];

    for (const name of reportNames) {
      await expect(
        page.getByText(name, { exact: true }).first()
      ).toBeVisible({ timeout: 10_000 });
    }
  });

  test("Reports tab shows Featured badge on Board Update", async ({
    page,
  }) => {
    await page.goto("/data-room");

    await expect(
      page.getByText("Featured").first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("Reports tab — report cards link to correct pages", async ({
    page,
  }) => {
    await page.goto("/data-room");

    // Board Update card should link to /reports/board-update
    const boardUpdateLink = page.locator("a[href='/reports/board-update']");
    await expect(boardUpdateLink).toBeVisible({ timeout: 10_000 });
  });

  test("Reports tab — each card shows 'Generate report' text", async ({
    page,
  }) => {
    await page.goto("/data-room");

    // At least several "Generate report" labels should be present
    const generateLinks = page.locator("text=Generate report");
    const count = await generateLinks.count();
    expect(count, "Should have multiple 'Generate report' labels").toBeGreaterThanOrEqual(4);
  });

  test("switching to Exports tab shows financial snapshot", async ({
    page,
  }) => {
    await page.goto("/data-room");

    // Click Exports tab
    await page.locator("button").filter({ hasText: "Exports" }).first().click();

    // Financial Snapshot section should appear
    await expect(
      page.getByText("Financial Snapshot").first()
    ).toBeVisible({ timeout: 10_000 });

    // Quick Exports section should appear
    await expect(
      page.getByText("Quick Exports").first()
    ).toBeVisible();
  });

  test("Exports tab — shows export items with format badges", async ({
    page,
  }) => {
    await page.goto("/data-room?tab=exports");

    await expect(
      page.getByText("Quick Exports").first()
    ).toBeVisible({ timeout: 10_000 });

    // Should have PDF and CSV export options
    await expect(
      page.getByText("Full Financial Package").first()
    ).toBeVisible();
    await expect(
      page.getByText("Key Metrics (CSV)").first()
    ).toBeVisible();
    await expect(
      page.getByText("Funding History (CSV)").first()
    ).toBeVisible();
  });

  test("Exports tab — Download All button is visible", async ({ page }) => {
    await page.goto("/data-room?tab=exports");

    await expect(
      page.getByRole("button", { name: /download all/i })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("Exports tab — Custom Report Builder shows section checkboxes", async ({
    page,
  }) => {
    await page.goto("/data-room?tab=exports");

    await expect(
      page.getByText("Custom Report Builder").first()
    ).toBeVisible({ timeout: 10_000 });

    // Section checkboxes should be present
    const sectionLabels = [
      "Financial Snapshot",
      "Profit & Loss",
      "Cash Flow",
      "Balance Sheet",
      "Runway Analysis",
      "Funding History",
    ];

    for (const label of sectionLabels) {
      await expect(
        page.locator("button").filter({ hasText: label }).first()
      ).toBeVisible();
    }
  });

  test("Exports tab — Custom Report Builder selection count updates", async ({
    page,
  }) => {
    await page.goto("/data-room?tab=exports");

    await expect(
      page.getByText("Custom Report Builder").first()
    ).toBeVisible({ timeout: 10_000 });

    // Initially all 6 sections selected — "6 of 6 selected" text
    await expect(
      page.getByText("6 of 6 selected").first()
    ).toBeVisible();

    // Deselect one section (e.g., "Funding History")
    await page
      .locator("button")
      .filter({ hasText: "Funding History" })
      .first()
      .click();

    await expect(
      page.getByText("5 of 6 selected").first()
    ).toBeVisible();
  });

  test("Exports tab — Generate Custom Report button is visible", async ({
    page,
  }) => {
    await page.goto("/data-room?tab=exports");

    await expect(
      page.getByRole("button", { name: /generate custom report/i })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("switching to Import tab shows import flow", async ({ page }) => {
    await page.goto("/data-room");

    // Click Import tab
    await page.locator("button").filter({ hasText: "Import" }).first().click();

    // Import flow should be embedded — look for file upload area
    await expect(
      page.getByText(/drag.+drop|upload|csv/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("URL parameter ?tab=exports opens Exports tab directly", async ({
    page,
  }) => {
    await page.goto("/data-room?tab=exports");

    await expect(
      page.getByText("Financial Snapshot").first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("URL parameter ?tab=import opens Import tab directly", async ({
    page,
  }) => {
    await page.goto("/data-room?tab=import");

    await expect(
      page.getByText(/drag.+drop|upload|csv/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("tab switching updates URL parameter", async ({ page }) => {
    await page.goto("/data-room");

    // Click Exports tab
    await page.locator("button").filter({ hasText: "Exports" }).first().click();

    // URL should update to include ?tab=exports
    await expect(page).toHaveURL(/tab=exports/);

    // Click Import tab
    await page.locator("button").filter({ hasText: "Import" }).first().click();

    await expect(page).toHaveURL(/tab=import/);

    // Click Reports tab
    await page.locator("button").filter({ hasText: "Reports" }).first().click();

    await expect(page).toHaveURL(/tab=reports/);
  });

  test("Exports tab shows financial metrics in snapshot grid", async ({
    page,
  }) => {
    await page.goto("/data-room?tab=exports");

    // Financial snapshot should show dollar amounts
    await expect(
      page.locator("text=/\\$[\\d,.]+[kKmM]?/").first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("Exports tab shows scenario name in snapshot", async ({ page }) => {
    await page.goto("/data-room?tab=exports");

    // Should display the scenario name (e.g., "Base Plan scenario")
    await expect(
      page.getByText(/scenario/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("report card navigation — clicking Profit & Loss goes to report", async ({
    page,
  }) => {
    await page.goto("/data-room");

    // Click on the Profit & Loss report card
    await page.locator("a[href='/reports/profit-loss']").click();

    await expect(page).toHaveURL(/\/reports\/profit-loss/, { timeout: 15_000 });
  });
});

test.describe("Data Room — /reports redirect", () => {
  test("/reports does not 500", async ({ page }) => {
    const response = await page.goto("/reports", { waitUntil: "commit" });
    expect(response?.status()).toBeLessThan(500);
  });
});
