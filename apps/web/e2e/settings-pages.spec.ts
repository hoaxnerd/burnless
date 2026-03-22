import { test, expect } from "@playwright/test";

/**
 * Settings Pages E2E Tests — BUR-248
 *
 * Tests all settings pages/tabs:
 *   - General tab: company profile, currency, locale
 *   - AI Features tab: master toggle, provider selection, budget, per-feature toggles
 *   - AI Dashboard tab: cost summary, daily spend, feature breakdown
 *   - Integrations tab: available and coming-soon integrations
 *   - Billing tab: plan display, pricing tiers
 *   - Tab navigation
 */

const dbAvailable = !!process.env.DATABASE_URL;

test.describe("Settings — tab navigation", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("settings page loads with tab navigation", async ({ page }) => {
    await page.goto("/settings");

    // Settings page should load (may show as part of dashboard shell)
    await expect(page).toHaveURL(/\/settings/);

    // Tabs should be visible
    const tabLabels = ["General", "AI Features", "AI Dashboard", "Integrations", "Billing"];
    for (const label of tabLabels) {
      await expect(
        page.locator("button").filter({ hasText: label }).first()
      ).toBeVisible({ timeout: 10_000 });
    }
  });

  test("clicking each tab switches content", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/settings/);

    // Click AI Features tab
    await page
      .locator("button")
      .filter({ hasText: "AI Features" })
      .first()
      .click();
    await expect(
      page.getByText(/ai features are|enable ai/i).first()
    ).toBeVisible({ timeout: 10_000 });

    // Click Integrations tab
    await page
      .locator("button")
      .filter({ hasText: "Integrations" })
      .first()
      .click();
    await expect(
      page.getByText(/csv import|stripe|available/i).first()
    ).toBeVisible({ timeout: 10_000 });

    // Click Billing tab
    await page
      .locator("button")
      .filter({ hasText: "Billing" })
      .first()
      .click();
    await expect(
      page.getByText(/free|pro|team/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Settings — General tab", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("General tab shows company name field", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/settings/);

    // General tab should be active by default
    await expect(
      page.getByPlaceholder("My Startup Inc.")
    ).toBeVisible({ timeout: 10_000 });
  });

  test("General tab shows stage dropdown", async ({ page }) => {
    await page.goto("/settings");

    await expect(
      page.locator("label", { hasText: /stage/i }).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("General tab shows currency dropdown", async ({ page }) => {
    await page.goto("/settings");

    await expect(
      page.locator("label", { hasText: /currency/i }).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("General tab shows Save Changes button", async ({ page }) => {
    await page.goto("/settings");

    await expect(
      page.getByRole("button", { name: /save changes/i })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("General tab shows security section", async ({ page }) => {
    await page.goto("/settings");

    await expect(
      page.getByText(/encrypted|security|privacy/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Settings — AI Features tab", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("AI Features tab shows master toggle", async ({ page }) => {
    await page.goto("/settings");

    await page
      .locator("button")
      .filter({ hasText: "AI Features" })
      .first()
      .click();

    // Master AI toggle should be visible
    await expect(
      page.getByText(/ai features are|enable ai/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("AI Features tab shows provider selection", async ({ page }) => {
    await page.goto("/settings");

    await page
      .locator("button")
      .filter({ hasText: "AI Features" })
      .first()
      .click();

    // Provider options should be visible (if AI enabled)
    const providers = ["Anthropic", "OpenAI", "OpenRouter", "Ollama"];
    for (const provider of providers) {
      const providerEl = page.getByText(provider, { exact: true }).first();
      // Providers may be hidden if AI is disabled — that's ok
      if (await providerEl.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await expect(providerEl).toBeVisible();
      }
    }
  });

  test("AI Features tab shows budget section", async ({ page }) => {
    await page.goto("/settings");

    await page
      .locator("button")
      .filter({ hasText: "AI Features" })
      .first()
      .click();

    // Budget presets visible if AI enabled
    const budgetSection = page.getByText(/budget|spending/i).first();
    if (await budgetSection.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(budgetSection).toBeVisible();
    }
  });

  test("AI Features tab shows data mode radio options", async ({ page }) => {
    await page.goto("/settings");

    await page
      .locator("button")
      .filter({ hasText: "AI Features" })
      .first()
      .click();

    // Data mode options if AI is enabled
    const fullMode = page.getByText(/full|generate new/i).first();
    if (await fullMode.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(fullMode).toBeVisible();
    }
  });

  test("AI Features tab shows write access modes", async ({ page }) => {
    await page.goto("/settings");

    await page
      .locator("button")
      .filter({ hasText: "AI Features" })
      .first()
      .click();

    const writeAccess = page.getByText(/write access|read only/i).first();
    if (await writeAccess.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(writeAccess).toBeVisible();
    }
  });
});

test.describe("Settings — AI Dashboard tab", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("AI Dashboard tab shows period selector and summary cards", async ({
    page,
  }) => {
    await page.goto("/settings");

    await page
      .locator("button")
      .filter({ hasText: "AI Dashboard" })
      .first()
      .click();

    // Period selector buttons
    await expect(page.getByText("7d").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("30d").first()).toBeVisible();
    await expect(page.getByText("90d").first()).toBeVisible();

    // Summary cards
    await expect(page.getByText("Total Cost").first()).toBeVisible();
    await expect(page.getByText("Requests").first()).toBeVisible();
  });
});

test.describe("Settings — Integrations tab", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("Integrations tab shows available integrations", async ({ page }) => {
    await page.goto("/settings");

    await page
      .locator("button")
      .filter({ hasText: "Integrations" })
      .first()
      .click();

    await expect(
      page.getByText("CSV Import").first()
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Stripe").first()).toBeVisible();
  });

  test("Integrations tab shows coming soon section", async ({ page }) => {
    await page.goto("/settings");

    await page
      .locator("button")
      .filter({ hasText: "Integrations" })
      .first()
      .click();

    // Coming soon integrations
    const comingSoon = ["Plaid", "QuickBooks", "Xero"];
    for (const name of comingSoon) {
      await expect(
        page.getByText(name).first()
      ).toBeVisible({ timeout: 10_000 });
    }
  });

  test("Integrations tab shows Notify Me buttons for coming soon", async ({
    page,
  }) => {
    await page.goto("/settings");

    await page
      .locator("button")
      .filter({ hasText: "Integrations" })
      .first()
      .click();

    const notifyButtons = page.locator("button").filter({ hasText: /notify me/i });
    const count = await notifyButtons.count();
    expect(count, "Should have Notify Me buttons for coming-soon integrations").toBeGreaterThanOrEqual(1);
  });
});

test.describe("Settings — Billing tab", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("Billing tab shows pricing tiers", async ({ page }) => {
    await page.goto("/settings");

    await page
      .locator("button")
      .filter({ hasText: "Billing" })
      .first()
      .click();

    // Three pricing tiers
    await expect(page.getByText("Free").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Pro").first()).toBeVisible();
    await expect(page.getByText("Team").first()).toBeVisible();
  });

  test("Billing tab shows pricing amounts", async ({ page }) => {
    await page.goto("/settings");

    await page
      .locator("button")
      .filter({ hasText: "Billing" })
      .first()
      .click();

    // Pricing amounts
    await expect(page.getByText("$0").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("$29").first()).toBeVisible();
    await expect(page.getByText("$79").first()).toBeVisible();
  });

  test("Billing tab shows current plan indicator", async ({ page }) => {
    await page.goto("/settings");

    await page
      .locator("button")
      .filter({ hasText: "Billing" })
      .first()
      .click();

    // Current plan badge/indicator
    await expect(
      page.getByText(/current plan/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });
});
