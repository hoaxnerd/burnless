import { test, expect } from "@playwright/test";

/**
 * Import workflow E2E tests.
 * Smoke tests run without auth. Upload/map/preview tests require auth.
 */

test.describe("Import smoke tests", () => {
  test("import page does not return 500", async ({ page }) => {
    const response = await page.goto("/import", { waitUntil: "commit" });
    expect(response?.status()).toBeLessThan(500);
  });

  test("import page redirects unauthenticated users", async ({ page }) => {
    await page.goto("/import", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/login/);
  });
});

const dbAvailable = !!process.env.DATABASE_URL;

test.describe("Import workflow UI (requires auth)", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL for authenticated tests");

  test("import page shows heading", async ({ page }) => {
    await page.goto("/import");
    await expect(page.getByText(/import/i).first()).toBeVisible();
  });

  test("upload area is visible with drop instructions", async ({ page }) => {
    await page.goto("/import");
    await expect(
      page.getByText(/drop.*csv|click.*upload/i)
    ).toBeVisible();
  });

  test("import page shows supported file formats", async ({ page }) => {
    await page.goto("/import");
    // Should indicate CSV support
    await expect(page.getByText(/csv/i).first()).toBeVisible();
  });
});
