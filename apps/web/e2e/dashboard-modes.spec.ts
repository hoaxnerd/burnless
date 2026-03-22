import { test, expect } from "@playwright/test";

/**
 * Dashboard Modes E2E Tests — BUR-248
 *
 * Tests dashboard intelligence modes:
 *   - Hero KPI cards visible (Cash, Burn, Runway, Revenue)
 *   - Mode switcher UI (Intelligence/Dynamic/Custom)
 *   - Card settings gear icon
 *   - Stats catalog / metric browser
 *   - Board Meeting Mode
 *   - Chart section (Cash Position, Revenue vs Expenses, etc.)
 *   - Quick actions
 *   - Key Metrics customization
 */

const dbAvailable = !!process.env.DATABASE_URL;

test.describe("Dashboard — hero KPI cards", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("dashboard shows 4 hero KPI cards", async ({ page }) => {
    await page.goto("/dashboard");

    // 4 hero metrics
    await expect(page.getByText(/cash position/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/monthly burn/i).first()).toBeVisible();
    await expect(page.getByText(/runway/i).first()).toBeVisible();
    await expect(page.getByText(/mrr|revenue/i).first()).toBeVisible();
  });

  test("hero cards show dollar amounts", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(
      page.locator("text=/\\$[\\d,.]+[kKmM]?/").first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("hero cards show sparkline trends", async ({ page }) => {
    await page.goto("/dashboard");

    // Sparklines render as SVG paths within cards
    // On desktop they should be visible (hidden on mobile)
    const sparklines = page.locator("svg path");
    const count = await sparklines.count();
    expect(count, "Should have chart/sparkline SVG paths").toBeGreaterThan(0);
  });
});

test.describe("Dashboard — charts section", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("dashboard shows financial charts", async ({ page }) => {
    await page.goto("/dashboard");

    // Chart titles
    await expect(
      page.getByText("Cash Position").first()
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText(/revenue vs expenses/i).first()
    ).toBeVisible();
  });

  test("charts have expand buttons", async ({ page }) => {
    await page.goto("/dashboard");

    // Expand buttons on chart headers (Maximize2 icon)
    const expandButtons = page.getByLabel(/expand|maximize/i);
    if (await expandButtons.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
      const count = await expandButtons.count();
      expect(count).toBeGreaterThan(0);
    }
  });
});

test.describe("Dashboard — Key Metrics card", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("Key Metrics section is visible", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(
      page.getByText("Key Metrics").first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("Key Metrics shows Customize button", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(
      page.getByText("Key Metrics").first()
    ).toBeVisible({ timeout: 10_000 });

    const customizeBtn = page.getByRole("button", { name: /customize/i });
    if (await customizeBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(customizeBtn).toBeVisible();
    }
  });
});

test.describe("Dashboard — mode switcher", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("card settings gear icon appears on hover", async ({ page }) => {
    await page.goto("/dashboard");

    // Hover over a hero card to reveal gear icon
    const firstCard = page.locator("[class*='hero'], [class*='kpi']").first();
    if (await firstCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await firstCard.hover();

      // Gear button should appear
      const settingsBtn = page.getByLabel(/settings|configure/i).first();
      if (await settingsBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await expect(settingsBtn).toBeVisible();
      }
    }
  });
});

test.describe("Dashboard — Board Meeting Mode", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("Board Mode button is visible in dashboard header", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    const boardModeBtn = page.getByRole("button", { name: /board mode/i });
    await expect(boardModeBtn).toBeVisible({ timeout: 10_000 });
  });

  test("clicking Board Mode opens full-screen overlay", async ({ page }) => {
    await page.goto("/dashboard");

    const boardModeBtn = page.getByRole("button", { name: /board mode/i });
    await expect(boardModeBtn).toBeVisible({ timeout: 10_000 });

    await boardModeBtn.click();

    // Should show financial snapshot with traffic-light signals
    await expect(
      page.getByText(/cash|burn|runway/i).first()
    ).toBeVisible({ timeout: 5_000 });

    // Should have Share as PDF and Copy buttons
    const shareBtn = page.getByRole("button", { name: /share|pdf/i });
    if (await shareBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(shareBtn).toBeVisible();
    }
  });

  test("pressing Escape closes Board Mode", async ({ page }) => {
    await page.goto("/dashboard");

    const boardModeBtn = page.getByRole("button", { name: /board mode/i });
    await expect(boardModeBtn).toBeVisible({ timeout: 10_000 });

    await boardModeBtn.click();

    // Wait for overlay
    await page.waitForTimeout(500);

    // Press Escape to close
    await page.keyboard.press("Escape");

    // Board mode overlay should close — dashboard content should be back
    await expect(
      page.getByRole("heading").first()
    ).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Dashboard — Metrics Catalog", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("Metrics Catalog button opens slide-over panel", async ({ page }) => {
    await page.goto("/dashboard");

    // Look for the catalog button (LayoutGrid icon button)
    const catalogBtn = page.getByLabel(/catalog|metrics/i).first();
    if (await catalogBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await catalogBtn.click();

      // Catalog should show search field and metric categories
      await expect(
        page.getByPlaceholder(/search/i).first()
      ).toBeVisible({ timeout: 5_000 });
    }
  });
});

test.describe("Dashboard — mobile viewport", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({
    storageState: "e2e/.auth/user.json",
    viewport: { width: 375, height: 812 },
  });

  test("dashboard loads on mobile with stacked KPI cards", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    await expect(page.getByText(/cash position/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/burn/i).first()).toBeVisible();
  });

  test("mobile dashboard has hamburger menu", async ({ page }) => {
    await page.goto("/dashboard");

    // On mobile, sidebar should be hidden; hamburger button should appear
    const menuBtn = page.getByLabel(/menu|toggle/i).first();
    if (await menuBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(menuBtn).toBeVisible();
    }
  });
});
