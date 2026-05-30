import { test, expect } from "@playwright/test";

// Requires DATABASE_URL + a seeded test account (pnpm db:seed-test-accounts) and
// an AI provider configured for the test env. Skips gracefully if AI is off.
test.describe("AI tool permissions", () => {
  // Auth is provided by the storageState in playwright.config.ts projects[2].
  test.use({ storageState: "e2e/.auth/user.json" });

  test("a write tool prompts for permission and proceeds on approval", async ({ page }) => {
    // MANDATORY skip: this test drives a live LLM turn; without a provider the
    // 30s waits would hang/fail in CI.
    test.skip(!process.env.AI_PROVIDER, "no AI provider configured");
    await page.goto("/ai");

    const input = page.getByPlaceholder(/ask/i).first();
    await input.fill("Create a scenario called Permissions QA");
    await input.press("Enter");

    // The inline permission card appears (write defaults to Ask).
    const card = page.getByText(/Approve this action\?|need your approval/i);
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: /allow once/i })).toBeVisible();

    await page.getByRole("button", { name: /allow once/i }).click();

    // After approval the card resolves and the assistant continues.
    await expect(page.getByText(/Permission resolved|created/i)).toBeVisible({ timeout: 30_000 });
  });

  test("settings pane exposes the five categories", async ({ page }) => {
    await page.goto("/ai");
    await page.getByRole("button", { name: /^Settings$/ }).click();
    await expect(page.getByText(/Read data/i)).toBeVisible();
    await expect(page.getByText(/Create \/ update/i)).toBeVisible();
    await expect(page.getByText(/Delete/i)).toBeVisible();
    await expect(page.getByText(/Web search/i)).toBeVisible();
    await expect(page.getByText(/Browser use/i)).toBeVisible();
  });
});
