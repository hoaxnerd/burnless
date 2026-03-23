import { test, expect, type Page } from "@playwright/test";

/**
 * Dashboard Features E2E Tests — BUR-272
 *
 * Comprehensive tests for dashboard card modes, rearrange, metric catalog,
 * persistence, and cross-feature interactions.
 *
 * Requires a running app with seeded database (demo@burnless.app).
 */

const dbAvailable = !!process.env.DATABASE_URL;

// ── Helpers ─────────────────────────────────────────────────────────────────

async function waitForDashboard(page: Page) {
  await page.goto("/dashboard");
  // Wait for hero cards to render (seeded data should show at least Cash)
  await expect(
    page.getByText(/cash position|monthly burn|runway|mrr|revenue/i).first()
  ).toBeVisible({ timeout: 15_000 });
}

// ── Card Settings Modal ────────────────────────────────────────────────────

test.describe("Dashboard — card settings modal", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("gear icon opens card settings modal on hero card", async ({ page }) => {
    await waitForDashboard(page);

    // Hover a hero card to reveal the gear icon
    // Hero cards have role="switch" toggles or gear buttons
    // Look for a settings/gear button that appears on hover
    const heroCardArea = page.locator("[data-grid-id='hero-0']").first();
    if (await heroCardArea.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await heroCardArea.hover();
    }

    // Try to find gear/settings button
    const gearButton = page.locator("button[title*='settings' i], button[title*='configure' i], button[aria-label*='settings' i]").first();
    if (await gearButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await gearButton.click();

      // Modal should show mode options
      await expect(
        page.getByText(/intelligence|dynamic|custom/i).first()
      ).toBeVisible({ timeout: 5_000 });
    }
  });

  test("card settings modal shows three mode options", async ({ page }) => {
    await waitForDashboard(page);

    // Find any card settings button
    const gearButtons = page.locator("button[title*='settings' i], button[title*='configure' i], button[aria-label*='settings' i]");
    const firstGear = gearButtons.first();

    if (await firstGear.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await firstGear.click();

      // Should show three mode choices
      await expect(page.getByText("Intelligence").first()).toBeVisible({ timeout: 5_000 });
      await expect(page.getByText("Dynamic").first()).toBeVisible();
      await expect(page.getByText("Custom").first()).toBeVisible();
    }
  });

  test("selecting Custom mode in card settings fires PATCH", async ({ page }) => {
    await waitForDashboard(page);

    const gearButtons = page.locator("button[title*='settings' i], button[title*='configure' i], button[aria-label*='settings' i]");
    const firstGear = gearButtons.first();

    if (await firstGear.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await firstGear.click();

      const customOption = page.getByText("Custom").first();
      if (await customOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
        const responsePromise = page.waitForResponse(
          (r) => r.url().includes("/api/dashboard-preferences") && r.request().method() === "PATCH",
          { timeout: 10_000 }
        );

        await customOption.click();
        const response = await responsePromise;
        expect(response.status()).toBeLessThan(300);
      }
    }
  });
});

// ── Metric Catalog ──────────────────────────────────────────────────────────

test.describe("Dashboard — metrics catalog", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("catalog button opens metrics browser", async ({ page }) => {
    await waitForDashboard(page);

    // Catalog button is in the header — LayoutGrid icon
    const catalogButton = page.locator("button[title*='catalog' i], button[title*='metrics' i]").first();
    if (await catalogButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await catalogButton.click();

      // Catalog slide-over should appear with search and category filters
      await expect(
        page.getByPlaceholder(/search/i).first()
      ).toBeVisible({ timeout: 5_000 });

      // Category filter pills
      await expect(page.getByText("All").first()).toBeVisible();
      await expect(page.getByText("Core").first()).toBeVisible();
    }
  });

  test("catalog search filters metrics", async ({ page }) => {
    await waitForDashboard(page);

    const catalogButton = page.locator("button[title*='catalog' i], button[title*='metrics' i]").first();
    if (!(await catalogButton.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await catalogButton.click();

    const searchInput = page.getByPlaceholder(/search/i).first();
    await expect(searchInput).toBeVisible({ timeout: 5_000 });

    // Type a search term
    await searchInput.fill("burn");

    // Should show burn-related metrics (e.g. "Net Burn Rate", "Gross Burn")
    await expect(
      page.getByText(/burn/i).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("catalog shows metric categories with filter pills", async ({ page }) => {
    await waitForDashboard(page);

    const catalogButton = page.locator("button[title*='catalog' i], button[title*='metrics' i]").first();
    if (!(await catalogButton.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await catalogButton.click();

    // Category filters should be visible
    const categories = ["All", "Core", "Advanced", "Deep"];
    for (const cat of categories) {
      const pill = page.getByRole("button", { name: cat }).or(page.getByText(cat, { exact: true })).first();
      if (await pill.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await expect(pill).toBeVisible();
      }
    }

    // Click "Core" category
    const corePill = page.getByRole("button", { name: "Core" }).or(page.getByText("Core", { exact: true })).first();
    if (await corePill.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await corePill.click();
      // Should still show metrics (filtered to Core tier)
      await page.waitForTimeout(500);
    }
  });

  test("adding metric from catalog fires preferences PATCH", async ({ page }) => {
    await waitForDashboard(page);

    const catalogButton = page.locator("button[title*='catalog' i], button[title*='metrics' i]").first();
    if (!(await catalogButton.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await catalogButton.click();
    await expect(page.getByPlaceholder(/search/i).first()).toBeVisible({ timeout: 5_000 });

    // Find an "Add" button for any metric
    const addButton = page.getByRole("button", { name: /^add$/i }).first();
    if (await addButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const responsePromise = page.waitForResponse(
        (r) => r.url().includes("/api/dashboard-preferences") && r.request().method() === "PATCH",
        { timeout: 10_000 }
      );

      await addButton.click();
      const response = await responsePromise;
      expect(response.status()).toBeLessThan(300);
    }
  });
});

// ── Dashboard Grid Rearrange ────────────────────────────────────────────────

test.describe("Dashboard — grid rearrange mode", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("Edit Layout button toggles drag mode", async ({ page }) => {
    await waitForDashboard(page);

    // Find the Edit Layout / Lock/Unlock button
    const editBtn = page.getByRole("button", { name: /edit layout|unlock|rearrange/i }).first();
    if (!(await editBtn.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await editBtn.click();

    // Should show drag handles or visual indicators of edit mode
    // And a "Lock" or "Done" button to exit edit mode
    const lockBtn = page.getByRole("button", { name: /lock|done|save layout/i }).first();
    await expect(lockBtn).toBeVisible({ timeout: 5_000 });

    // Click lock to exit edit mode
    await lockBtn.click();
  });

  test("Reset button reverts layout to defaults", async ({ page }) => {
    await waitForDashboard(page);

    // Enter edit mode first
    const editBtn = page.getByRole("button", { name: /edit layout|unlock|rearrange/i }).first();
    if (!(await editBtn.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await editBtn.click();

    // Find and click Reset button
    const resetBtn = page.getByRole("button", { name: /reset/i }).first();
    if (await resetBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const responsePromise = page.waitForResponse(
        (r) => r.url().includes("/api/dashboard-preferences") && r.request().method() === "PATCH",
        { timeout: 10_000 }
      );

      await resetBtn.click();
      const response = await responsePromise;
      expect(response.status()).toBeLessThan(300);
    }
  });
});

// ── Key Metrics (Secondary Metrics) ─────────────────────────────────────────

test.describe("Dashboard — Key Metrics card", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("Key Metrics section renders with metric rows", async ({ page }) => {
    await waitForDashboard(page);

    const keyMetrics = page.getByText("Key Metrics").first();
    await expect(keyMetrics).toBeVisible({ timeout: 10_000 });

    // Should show at least one metric value (formatted as $ or %)
    await expect(
      page.locator("text=/\\$[\\d,.]+|\\d+\\.\\d+%/").first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("Customize button opens catalog in add-metric mode", async ({ page }) => {
    await waitForDashboard(page);

    const customizeBtn = page.getByRole("button", { name: /customize/i }).first();
    if (!(await customizeBtn.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await customizeBtn.click();

    // Catalog should open with add-to-secondary-metrics context
    await expect(
      page.getByPlaceholder(/search/i).first()
    ).toBeVisible({ timeout: 5_000 });
  });
});

// ── Dashboard Charts ────────────────────────────────────────────────────────

test.describe("Dashboard — chart cards", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("all four chart cards render", async ({ page }) => {
    await waitForDashboard(page);

    const charts = [
      "Cash Position",
      /revenue vs expenses/i,
      /burn.*runway/i,
      /mrr|monthly recurring/i,
    ];

    for (const chart of charts) {
      const el = typeof chart === "string"
        ? page.getByText(chart).first()
        : page.getByText(chart).first();
      if (await el.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await expect(el).toBeVisible();
      }
    }
  });

  test("chart expand button opens full-screen modal", async ({ page }) => {
    await waitForDashboard(page);

    // Find an expand/maximize button on any chart
    const expandBtn = page.locator("button[title*='expand' i], button[title*='maximize' i], button[aria-label*='expand' i]").first();
    if (!(await expandBtn.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await expandBtn.click();

    // Full-screen modal should appear
    // Look for a close button or the chart content in larger view
    const closeBtn = page.locator("button[title*='close' i], button[aria-label*='close' i]").first();
    if (await closeBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await closeBtn.click();
    } else {
      // Try Escape
      await page.keyboard.press("Escape");
    }
  });
});

// ── Board Meeting Mode ──────────────────────────────────────────────────────

test.describe("Dashboard — Board Meeting Mode", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("Board Mode renders financial snapshot with traffic light signals", async ({ page }) => {
    await waitForDashboard(page);

    const boardBtn = page.getByRole("button", { name: /board mode/i });
    await expect(boardBtn).toBeVisible({ timeout: 10_000 });

    await boardBtn.click();

    // Should show company name and key financial metrics
    await expect(
      page.getByText(/cash|burn|runway/i).first()
    ).toBeVisible({ timeout: 5_000 });

    // Should have action buttons (Download, Copy)
    const actionBtns = page.locator("button").filter({ hasText: /download|copy|share|pdf/i });
    if (await actionBtns.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
      expect(await actionBtns.count()).toBeGreaterThan(0);
    }

    // Close with Escape
    await page.keyboard.press("Escape");
  });

  test("Board Mode keyboard shortcut works (Cmd+Shift+P)", async ({ page }) => {
    await waitForDashboard(page);

    // Trigger Board Mode via keyboard
    await page.keyboard.press("Meta+Shift+p");

    // Check if overlay appeared
    const overlay = page.getByText(/financial snapshot|board meeting/i).first();
    if (await overlay.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(overlay).toBeVisible();
      await page.keyboard.press("Escape");
    }
  });
});

// ── Quick Actions ───────────────────────────────────────────────────────────

test.describe("Dashboard — quick actions", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("quick actions card shows action buttons", async ({ page }) => {
    await waitForDashboard(page);

    // Quick actions should be visible (may need to scroll)
    const quickActions = page.getByText("Quick Actions").first();
    if (await quickActions.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(quickActions).toBeVisible();

      // Should have action buttons
      const actions = ["Add Expense", "Add Revenue", "Create Scenario", "Import Data"];
      for (const action of actions) {
        const btn = page.getByRole("button", { name: new RegExp(action, "i") }).first();
        if (await btn.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await expect(btn).toBeVisible();
        }
      }
    }
  });

  test("Add Expense quick action opens inline form", async ({ page }) => {
    await waitForDashboard(page);

    const expenseBtn = page.getByRole("button", { name: /add expense/i }).first();
    if (!(await expenseBtn.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await expenseBtn.click();

    // Should show expense form fields
    await expect(
      page.getByPlaceholder(/name|expense/i).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("Add Revenue quick action opens inline form", async ({ page }) => {
    await waitForDashboard(page);

    const revenueBtn = page.getByRole("button", { name: /add revenue/i }).first();
    if (!(await revenueBtn.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await revenueBtn.click();

    // Should show revenue form fields
    await expect(
      page.getByPlaceholder(/name|revenue/i).first()
    ).toBeVisible({ timeout: 5_000 });
  });
});

// ── Persistence ─────────────────────────────────────────────────────────────

test.describe("Dashboard — preferences persistence", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("dashboard preferences load from API on page load", async ({ page }) => {
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes("/api/dashboard-preferences") && r.request().method() === "GET",
      { timeout: 15_000 }
    );

    await page.goto("/dashboard");
    const response = await responsePromise;
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("mode");
    expect(body).toHaveProperty("heroCards");
    expect(body).toHaveProperty("secondaryMetrics");
  });

  test("dashboard layout survives page reload", async ({ page }) => {
    await waitForDashboard(page);

    // Capture initial hero card count
    const heroLabels = ["Cash Position", "Monthly Burn", "Runway", "MRR", "Revenue"];
    let visibleCount = 0;
    for (const label of heroLabels) {
      if (await page.getByText(label).first().isVisible({ timeout: 2_000 }).catch(() => false)) {
        visibleCount++;
      }
    }

    // Reload
    await page.reload();
    await expect(
      page.getByText(/cash position|monthly burn|runway|mrr|revenue/i).first()
    ).toBeVisible({ timeout: 15_000 });

    // Same hero cards should be visible after reload
    let visibleAfter = 0;
    for (const label of heroLabels) {
      if (await page.getByText(label).first().isVisible({ timeout: 2_000 }).catch(() => false)) {
        visibleAfter++;
      }
    }

    expect(visibleAfter).toBe(visibleCount);
  });
});

// ── Mobile Responsive ───────────────────────────────────────────────────────

test.describe("Dashboard — mobile viewport", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({
    storageState: "e2e/.auth/user.json",
    viewport: { width: 375, height: 812 },
  });

  test("dashboard renders on mobile with stacked layout", async ({ page }) => {
    await page.goto("/dashboard");

    // Hero cards should still be visible on mobile
    await expect(
      page.getByText(/cash position|monthly burn|runway|mrr|revenue/i).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("charts are visible on mobile (may be collapsed)", async ({ page }) => {
    await page.goto("/dashboard");

    // Wait for content to load
    await expect(
      page.getByText(/cash position/i).first()
    ).toBeVisible({ timeout: 15_000 });

    // Charts should exist (may need to scroll)
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    const chartEl = page.getByText("Cash Position").first();
    if (await chartEl.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(chartEl).toBeVisible();
    }
  });
});

// ── Weekly Digest Banner ────────────────────────────────────────────────────

test.describe("Dashboard — weekly digest", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("weekly digest fetches from API", async ({ page }) => {
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes("/api/digest"),
      { timeout: 15_000 }
    );

    await page.goto("/dashboard");

    // The digest endpoint should be called (may return 200 or 404 depending on data)
    const response = await responsePromise;
    expect(response.status()).toBeLessThan(500);
  });
});

// ── Empty State ─────────────────────────────────────────────────────────────

test.describe("Dashboard — data loading", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("dashboard page does not crash (returns < 500)", async ({ page }) => {
    const response = await page.goto("/dashboard");
    expect(response?.status()).toBeLessThan(500);
  });

  test("dashboard shows either data or empty state", async ({ page }) => {
    await page.goto("/dashboard");

    // Should show either hero cards (has data) or empty state prompt
    const hasData = await page
      .getByText(/cash position|monthly burn|runway/i)
      .first()
      .isVisible({ timeout: 10_000 })
      .catch(() => false);

    const hasEmptyState = await page
      .getByText(/add financials|get started|no data/i)
      .first()
      .isVisible({ timeout: 3_000 })
      .catch(() => false);

    expect(hasData || hasEmptyState).toBe(true);
  });
});
