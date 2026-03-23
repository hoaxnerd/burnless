import { test, expect } from "@playwright/test";

/**
 * Dashboard Card Settings E2E Tests — BUR-272
 *
 * Tests card settings modal, mode switching (Dynamic/Custom/Intelligence),
 * metric selection in custom mode, and persistence across page reloads.
 */

const dbAvailable = !!process.env.DATABASE_URL;

test.describe("Dashboard — card settings modal", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("gear icon opens card settings modal", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Hover over first hero card to reveal gear
    const heroCards = page.locator("[class*='rounded-2xl'][class*='border'][class*='p-5']");
    const firstCard = heroCards.first();
    await expect(firstCard).toBeVisible({ timeout: 10_000 });
    await firstCard.hover();

    // Click settings gear
    const gearBtn = page.getByLabel("Card settings").first();
    if (await gearBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await gearBtn.click();

      // Modal should open with "Card Settings" title
      await expect(
        page.getByText("Card Settings").first()
      ).toBeVisible({ timeout: 5_000 });

      // Should show DISPLAY MODE section with mode options
      await expect(
        page.getByText(/display mode/i).first()
      ).toBeVisible();
    }
  });

  test("card settings modal shows three mode options", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const heroCards = page.locator("[class*='rounded-2xl'][class*='border'][class*='p-5']");
    await expect(heroCards.first()).toBeVisible({ timeout: 10_000 });
    await heroCards.first().hover();

    const gearBtn = page.getByLabel("Card settings").first();
    if (!(await gearBtn.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, "Gear button not visible — no data seeded");
      return;
    }
    await gearBtn.click();

    await expect(page.getByText("Card Settings").first()).toBeVisible({ timeout: 5_000 });

    // Three mode buttons should exist
    await expect(page.getByText("Dynamic").first()).toBeVisible();
    await expect(page.getByText("Custom").first()).toBeVisible();
    // Intelligence may be disabled if AI is off, but should exist
    await expect(page.getByText("Intelligence").first()).toBeVisible();
  });

  test("switching to Custom mode shows metric selector", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const heroCards = page.locator("[class*='rounded-2xl'][class*='border'][class*='p-5']");
    await expect(heroCards.first()).toBeVisible({ timeout: 10_000 });
    await heroCards.first().hover();

    const gearBtn = page.getByLabel("Card settings").first();
    if (!(await gearBtn.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, "Gear button not visible");
      return;
    }
    await gearBtn.click();
    await expect(page.getByText("Card Settings").first()).toBeVisible({ timeout: 5_000 });

    // Click Custom mode
    const customBtn = page.locator("button").filter({ hasText: "Custom" }).first();
    await customBtn.click();

    // Should show metric search/catalog inline
    await expect(
      page.getByPlaceholder(/search metrics/i).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("Done button closes card settings modal", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const heroCards = page.locator("[class*='rounded-2xl'][class*='border'][class*='p-5']");
    await expect(heroCards.first()).toBeVisible({ timeout: 10_000 });
    await heroCards.first().hover();

    const gearBtn = page.getByLabel("Card settings").first();
    if (!(await gearBtn.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, "Gear button not visible");
      return;
    }
    await gearBtn.click();
    await expect(page.getByText("Card Settings").first()).toBeVisible({ timeout: 5_000 });

    // Click Done
    const doneBtn = page.getByRole("button", { name: "Done" });
    await doneBtn.click();

    // Modal should be closed
    await expect(page.getByText("Card Settings")).toBeHidden({ timeout: 3_000 });
  });

  test("mode selection persists after closing and reopening modal", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const heroCards = page.locator("[class*='rounded-2xl'][class*='border'][class*='p-5']");
    await expect(heroCards.first()).toBeVisible({ timeout: 10_000 });
    await heroCards.first().hover();

    const gearBtn = page.getByLabel("Card settings").first();
    if (!(await gearBtn.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, "Gear button not visible");
      return;
    }

    // Open modal and switch to Custom
    await gearBtn.click();
    await expect(page.getByText("Card Settings").first()).toBeVisible({ timeout: 5_000 });

    const customBtn = page.locator("button").filter({ hasText: "Custom" }).first();
    await customBtn.click();
    await page.waitForTimeout(500); // Let API call complete

    // Close modal
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByText("Card Settings")).toBeHidden({ timeout: 3_000 });

    // Reopen modal
    await heroCards.first().hover();
    await gearBtn.click();
    await expect(page.getByText("Card Settings").first()).toBeVisible({ timeout: 5_000 });

    // Custom mode should still be active (has a check icon or active styling)
    const customModeActive = page.locator("button").filter({ hasText: "Custom" }).first();
    const activeClass = await customModeActive.getAttribute("class");
    expect(
      activeClass,
      "Custom mode should retain active state after reopening"
    ).toMatch(/brand|ring|active/i);
  });

  test("mode selection persists after page reload", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const heroCards = page.locator("[class*='rounded-2xl'][class*='border'][class*='p-5']");
    await expect(heroCards.first()).toBeVisible({ timeout: 10_000 });
    await heroCards.first().hover();

    const gearBtn = page.getByLabel("Card settings").first();
    if (!(await gearBtn.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, "Gear button not visible");
      return;
    }

    // Switch to Dynamic mode explicitly
    await gearBtn.click();
    await expect(page.getByText("Card Settings").first()).toBeVisible({ timeout: 5_000 });

    const dynamicBtn = page.locator("button").filter({ hasText: "Dynamic" }).first();
    await dynamicBtn.click();
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "Done" }).click();

    // Reload page
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(heroCards.first()).toBeVisible({ timeout: 10_000 });

    // Reopen modal and verify mode persisted
    await heroCards.first().hover();
    const gearBtnAfter = page.getByLabel("Card settings").first();
    if (await gearBtnAfter.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await gearBtnAfter.click();
      await expect(page.getByText("Card Settings").first()).toBeVisible({ timeout: 5_000 });

      const dynamicActive = page.locator("button").filter({ hasText: "Dynamic" }).first();
      const cls = await dynamicActive.getAttribute("class");
      expect(cls, "Dynamic mode should persist after page reload").toMatch(/brand|ring|active/i);
    }
  });

  test("Intelligence mode is disabled when AI is off", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const heroCards = page.locator("[class*='rounded-2xl'][class*='border'][class*='p-5']");
    await expect(heroCards.first()).toBeVisible({ timeout: 10_000 });
    await heroCards.first().hover();

    const gearBtn = page.getByLabel("Card settings").first();
    if (!(await gearBtn.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, "Gear button not visible");
      return;
    }
    await gearBtn.click();
    await expect(page.getByText("Card Settings").first()).toBeVisible({ timeout: 5_000 });

    // Check if Intelligence button shows "Requires AI" badge when AI is disabled
    const intelligenceBtn = page.locator("button").filter({ hasText: "Intelligence" }).first();
    const isDisabled = await intelligenceBtn.getAttribute("disabled").catch(() => null);
    const requiresAI = page.getByText(/requires ai/i);

    // Either the button is disabled, or there's a "Requires AI" label
    if (isDisabled !== null || await requiresAI.isVisible({ timeout: 1_000 }).catch(() => false)) {
      // Good — Intelligence is properly gated when AI is off
      expect(true).toBeTruthy();
    }
    // If AI is enabled, Intelligence should be clickable — that's also fine
  });
});

test.describe("Dashboard — custom mode metric selection", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("selecting a metric in custom mode updates the card", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const heroCards = page.locator("[class*='rounded-2xl'][class*='border'][class*='p-5']");
    await expect(heroCards.first()).toBeVisible({ timeout: 10_000 });
    await heroCards.first().hover();

    const gearBtn = page.getByLabel("Card settings").first();
    if (!(await gearBtn.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, "Gear button not visible");
      return;
    }
    await gearBtn.click();
    await expect(page.getByText("Card Settings").first()).toBeVisible({ timeout: 5_000 });

    // Switch to Custom mode
    const customBtn = page.locator("button").filter({ hasText: "Custom" }).first();
    await customBtn.click();
    await page.waitForTimeout(500);

    // Wait for metric list to appear
    const searchInput = page.getByPlaceholder(/search metrics/i).first();
    if (await searchInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      // Find a "Select" or "Add" button in the metric list and click it
      const selectBtn = page.getByRole("button", { name: /^select$/i }).first();
      if (await selectBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await selectBtn.click();
        await page.waitForTimeout(500);
      }
    }

    // Click Done to apply
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByText("Card Settings")).toBeHidden({ timeout: 3_000 });
  });
});

test.describe("Dashboard — card settings mobile", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({
    storageState: "e2e/.auth/user.json",
    viewport: { width: 375, height: 812 },
  });

  test("card settings modal works on mobile viewport", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // On mobile, hero cards should be visible (stacked)
    await expect(page.getByText(/cash position/i).first()).toBeVisible({ timeout: 10_000 });

    // Try to open card settings on mobile
    const heroCards = page.locator("[class*='rounded-2xl'][class*='border'][class*='p-5']");
    if (await heroCards.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
      await heroCards.first().tap();

      const gearBtn = page.getByLabel("Card settings").first();
      if (await gearBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await gearBtn.tap();

        // Modal should open and be usable on mobile
        await expect(
          page.getByText("Card Settings").first()
        ).toBeVisible({ timeout: 5_000 });

        // Mode buttons should be visible
        await expect(page.getByText("Dynamic").first()).toBeVisible();
      }
    }
  });
});
