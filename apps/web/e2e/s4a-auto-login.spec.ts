import { test, expect } from "@playwright/test";

// Fresh-instance auto-login: no login screen, lands in onboarding (no company yet).
test("auto-login drops a fresh instance into onboarding", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/dashboard");
  // middleware → /api/auth/auto-login → signIn → no company → /onboarding
  await expect(page).toHaveURL(/\/onboarding/);
});

test("/login is skipped by auto-login when not signed out", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/login");
  await expect(page).not.toHaveURL(/\/login$/);
});
