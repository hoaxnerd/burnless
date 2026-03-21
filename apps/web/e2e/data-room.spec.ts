import { test, expect } from "@playwright/test";

/**
 * Data room page E2E tests.
 */

test.describe("Data Room smoke tests", () => {
  test("data room page does not return 500", async ({ page }) => {
    const response = await page.goto("/data-room", { waitUntil: "commit" });
    expect(response?.status()).toBeLessThan(500);
  });

  test("data room page redirects unauthenticated users", async ({ page }) => {
    await page.goto("/data-room", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/login/);
  });
});

const dbAvailable = !!process.env.DATABASE_URL;

test.describe("Data Room UI (requires auth)", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL for authenticated tests");

  test("data room page shows heading or financial data", async ({ page }) => {
    await page.goto("/data-room");
    // Data room should show either a heading or financial statements
    const heading = page.getByRole("heading").first();
    await expect(heading).toBeVisible();
  });
});
