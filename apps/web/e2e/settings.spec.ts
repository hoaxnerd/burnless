import { test, expect } from "@playwright/test";

/**
 * Settings page E2E tests.
 * Smoke tests run without auth. Content tests gated behind DATABASE_URL.
 */

test.describe("Settings smoke tests", () => {
  test("settings page does not return 500", async ({ page }) => {
    const response = await page.goto("/settings", { waitUntil: "commit" });
    expect(response?.status()).toBeLessThan(500);
  });

  test("settings page redirects unauthenticated users", async ({ page }) => {
    await page.goto("/settings", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/login/);
  });
});

const dbAvailable = !!process.env.DATABASE_URL;

test.describe("Settings page UI (requires auth)", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL for authenticated tests");

  test("renders Settings heading", async ({ page }) => {
    await page.goto("/settings");
    await expect(
      page.getByRole("heading", { name: "Settings" })
    ).toBeVisible();
  });

  test("General tab is visible", async ({ page }) => {
    await page.goto("/settings");
    await expect(
      page.getByRole("tab", { name: /general/i })
    ).toBeVisible();
  });

  test("AI Features tab is visible", async ({ page }) => {
    await page.goto("/settings");
    await expect(
      page.getByRole("tab", { name: /ai features/i })
    ).toBeVisible();
  });

  test("Integrations tab is visible", async ({ page }) => {
    await page.goto("/settings");
    await expect(
      page.getByRole("tab", { name: /integrations/i })
    ).toBeVisible();
  });

  test("switching to AI Features tab shows toggle controls", async ({
    page,
  }) => {
    await page.goto("/settings");
    await page.getByRole("tab", { name: /ai features/i }).click();
    // Should show a master AI toggle or individual feature toggles
    await expect(page.getByText(/master|enable ai/i)).toBeVisible();
  });

  test("switching to Integrations tab shows integration list", async ({
    page,
  }) => {
    await page.goto("/settings");
    await page.getByRole("tab", { name: /integrations/i }).click();
    await expect(page.getByText("CSV Import")).toBeVisible();
    await expect(page.getByText("Stripe")).toBeVisible();
  });

  test("integrations shows coming soon items", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("tab", { name: /integrations/i }).click();
    await expect(page.getByText("Plaid")).toBeVisible();
    await expect(page.getByText("QuickBooks")).toBeVisible();
  });
});
