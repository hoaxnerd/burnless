// apps/web/e2e/onboarding-redirect-guard.spec.ts
//
// RED guard for ONB-01: an already-onboarded user (the authed e2e test user has a
// company) can fully render and interact with the onboarding wizard — there is no
// server-side layout guard, only a 409 at submit. This spec asserts the FIXED
// behavior: navigating to /onboarding redirects to /dashboard BEFORE the wizard
// renders. RED against today's app (wizard renders at /onboarding).
import { test, expect } from "@playwright/test";

test.describe("Onboarding redirect guard (ONB-01)", () => {
  test.use({ storageState: "e2e/.auth/user.json" });

  test("an onboarded user hitting /onboarding is redirected to /dashboard before the wizard mounts", async ({
    page,
  }) => {
    await page.goto("/onboarding");

    // FIXED contract: server-side guard redirects an onboarded user away.
    await expect(page).toHaveURL(/\/dashboard(\/|\?|$)/, { timeout: 15_000 });

    // The wizard must NOT have rendered (website step / "Set Up My Company" CTA).
    await expect(
      page.getByRole("button", { name: /set up my company/i }),
    ).toHaveCount(0);
    await expect(page.getByPlaceholder(/yourcompany\.com/i)).toHaveCount(0);
  });
});
