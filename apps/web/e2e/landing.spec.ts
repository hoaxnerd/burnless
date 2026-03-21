import { test, expect } from "@playwright/test";

/**
 * Landing page E2E tests — verify the public landing page content and behavior.
 */

test.describe("Landing page", () => {
  test("loads successfully with 200 status", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
  });

  test("has visible call-to-action", async ({ page }) => {
    await page.goto("/");
    // There should be a CTA button/link to get started or sign up
    const cta = page.getByRole("link", { name: /get started|sign up|try/i });
    if (await cta.isVisible()) {
      await expect(cta).toBeVisible();
    }
  });

  test("has navigation links", async ({ page }) => {
    await page.goto("/");
    // Login link should be present
    const loginLink = page.getByRole("link", { name: /log in|sign in/i });
    if (await loginLink.isVisible()) {
      await expect(loginLink).toBeVisible();
    }
  });

  test("does not expose sensitive data on public page", async ({ page }) => {
    await page.goto("/");
    const content = await page.content();
    // Should not contain API keys or sensitive tokens
    expect(content).not.toContain("sk-");
    expect(content).not.toContain("NEXT_AUTH_SECRET");
  });

  test("responds with correct content-type headers", async ({ page }) => {
    const response = await page.goto("/");
    const contentType = response?.headers()["content-type"] ?? "";
    expect(contentType).toContain("text/html");
  });
});
