import { test, expect } from "@playwright/test";

/**
 * Smoke tests — verify core pages load without crashing (no 500 errors).
 * These catch the "ISE on page load" class of bugs.
 */

test.describe("Page smoke tests", () => {
  test("landing page loads without error", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBeLessThan(500);
  });

  test("login page loads without error", async ({ page }) => {
    const response = await page.goto("/login");
    expect(response?.status()).toBeLessThan(500);
    await expect(page.getByText("Welcome to burnless")).toBeVisible();
  });

  test("onboarding page loads without error", async ({ page }) => {
    const response = await page.goto("/onboarding");
    expect(response?.status()).toBeLessThan(500);
    await expect(page.getByPlaceholder("yourcompany.com")).toBeVisible();
  });

  test("protected routes don't return 500", async ({ page }) => {
    // Dashboard should redirect unauthenticated users, not crash
    const response = await page.goto("/dashboard", {
      waitUntil: "commit",
    });
    // Accept redirects (302) or client-side redirects, but never 500
    expect(response?.status()).toBeLessThan(500);
  });
});
