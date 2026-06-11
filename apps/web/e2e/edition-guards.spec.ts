import { test, expect } from "@playwright/test";
// Assumes the test server runs with self_host defaults (BURNLESS_DEPLOYMENT unset).
test.describe("edition guards (self_host)", () => {
  test("/pricing is not found under self_host", async ({ page }) => {
    const res = await page.goto("/pricing");
    expect(res?.status()).toBe(404);
  });
  test("/ does not render the marketing pricing nav under self_host", async ({ page }) => {
    await page.goto("/");
    // self_host redirects '/' into the app (dashboard/login), never the marketing landing
    await expect(page).not.toHaveURL(/\/pricing/);
  });
});
