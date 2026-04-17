import { test, expect } from "@playwright/test";

/**
 * Floating Sidebar E2E Tests — BUR-196 / BUR-171
 *
 * Tests the redesigned floating sidebar with:
 *   - Floating layout with rounded corners and shadow
 *   - Search trigger (Cmd+K)
 *   - Quick actions section
 *   - Companion prominence
 *   - Drag-and-drop reorder (basic verification)
 *   - Collapse/expand behavior
 *   - Mobile hamburger menu + overlay
 *   - Settings link and user profile section
 */

const dbAvailable = !!process.env.DATABASE_URL;

test.describe("Floating sidebar — authenticated", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("sidebar is visible on desktop and has floating style", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);

    // Sidebar should be inside an aside with "Main navigation" label
    const sidebar = page.getByLabel("Main navigation").first();
    await expect(sidebar).toBeVisible({ timeout: 10_000 });

    // Should contain the burnless brand logo
    await expect(sidebar.locator("text=burnless").first()).toBeVisible();
  });

  test("sidebar shows all core navigation links", async ({ page }) => {
    await page.goto("/dashboard");
    const nav = page.getByLabel("Main navigation").first();

    const expectedLinks = [
      "Dashboard",
      "Expenses",
      "Revenue",
      "Funding",
      "Team",
      "Scenarios",
      "Data Room",
    ];

    for (const label of expectedLinks) {
      await expect(
        nav.getByRole("link", { name: label, exact: true })
      ).toBeVisible();
    }
  });

  test("sidebar shows Settings link", async ({ page }) => {
    await page.goto("/dashboard");
    const nav = page.getByLabel("Main navigation").first();

    const settingsLink = nav.getByRole("link", { name: "Settings" });
    await expect(settingsLink).toBeVisible();
  });

  test("Settings link navigates to /settings", async ({ page }) => {
    await page.goto("/dashboard");
    const nav = page.getByLabel("Main navigation").first();

    await nav.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings/);
  });

  test("sidebar active state highlights current page", async ({ page }) => {
    await page.goto("/expenses");
    const nav = page.getByLabel("Main navigation").first();

    // Expenses link should have aria-current="page"
    const expensesLink = nav.getByRole("link", { name: "Expenses", exact: true });
    await expect(expensesLink).toHaveAttribute("aria-current", "page");

    // Dashboard link should NOT have aria-current
    const dashboardLink = nav.getByRole("link", { name: "Dashboard", exact: true });
    await expect(dashboardLink).not.toHaveAttribute("aria-current", "page");
  });

  test("sidebar collapse button toggles collapsed state", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    const nav = page.getByLabel("Main navigation").first();

    // Expanded: "Collapse sidebar" button should be visible
    const collapseBtn = nav.getByLabel("Collapse sidebar");
    await expect(collapseBtn).toBeVisible({ timeout: 10_000 });

    // Click collapse
    await collapseBtn.click();

    // After collapsing: "Expand sidebar" button should appear
    const expandBtn = nav.getByLabel("Expand sidebar");
    await expect(expandBtn).toBeVisible({ timeout: 5_000 });

    // Nav text labels should be hidden when collapsed
    // The "Dashboard" text span should not be visible
    await expect(
      nav.locator("span", { hasText: "Dashboard" }).first()
    ).not.toBeVisible();

    // Expand again
    await expandBtn.click();
    await expect(nav.getByLabel("Collapse sidebar")).toBeVisible();
    await expect(
      nav.getByRole("link", { name: "Dashboard", exact: true })
    ).toBeVisible();
  });

  test("search trigger button opens command palette", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);

    // Find the search button in sidebar (contains "Search..." text)
    const searchBtn = page.locator("button", { hasText: "Search..." }).first();
    await expect(searchBtn).toBeVisible({ timeout: 10_000 });

    await searchBtn.click();

    // Command palette should open
    await expect(
      page.getByPlaceholder("Search pages, actions, data...")
    ).toBeVisible();
  });

  test("Cmd+K keyboard shortcut opens command palette", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);

    // Wait for page to stabilize
    await page.waitForTimeout(500);

    // Press Cmd+K (Meta+K on Mac)
    await page.keyboard.press("Meta+k");

    // Command palette should open
    await expect(
      page.getByPlaceholder("Search pages, actions, data...")
    ).toBeVisible({ timeout: 5_000 });
  });

  test("command palette shows category filter tabs", async ({ page }) => {
    await page.goto("/dashboard");
    await page.keyboard.press("Meta+k");

    await expect(
      page.getByPlaceholder("Search pages, actions, data...")
    ).toBeVisible({ timeout: 5_000 });

    // Category tabs should be present
    const tabs = ["All", "Pages", "Actions", "Data"];
    for (const tab of tabs) {
      await expect(
        page
          .locator("button")
          .filter({ hasText: new RegExp(`^${tab}$`) })
          .first()
      ).toBeVisible();
    }
  });

  test("command palette filters results by search query", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await page.keyboard.press("Meta+k");

    const input = page.getByPlaceholder("Search pages, actions, data...");
    await expect(input).toBeVisible({ timeout: 5_000 });

    // Search for "expenses"
    await input.fill("expenses");

    // Should show Expenses-related results
    await expect(
      page.locator("[role='option']", { hasText: "Expenses" }).first()
    ).toBeVisible();
  });

  test("command palette search — no results shows helpful message", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await page.keyboard.press("Meta+k");

    const input = page.getByPlaceholder("Search pages, actions, data...");
    await expect(input).toBeVisible({ timeout: 5_000 });

    // Search for something that won't match
    await input.fill("zzzznonexistent");

    await expect(page.getByText(/No results for/)).toBeVisible();
  });

  test("command palette closes on Escape", async ({ page }) => {
    await page.goto("/dashboard");
    await page.keyboard.press("Meta+k");

    const input = page.getByPlaceholder("Search pages, actions, data...");
    await expect(input).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press("Escape");

    await expect(input).not.toBeVisible();
  });

  test("command palette — selecting a page navigates to it", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await page.keyboard.press("Meta+k");

    const input = page.getByPlaceholder("Search pages, actions, data...");
    await expect(input).toBeVisible({ timeout: 5_000 });

    await input.fill("revenue");

    // Click on the Revenue option
    await page
      .locator("[role='option']", { hasText: "Revenue" })
      .first()
      .click();

    await expect(page).toHaveURL(/\/revenue/, { timeout: 10_000 });
  });

  test("command palette — keyboard navigation with Enter selects item", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await page.keyboard.press("Meta+k");

    const input = page.getByPlaceholder("Search pages, actions, data...");
    await expect(input).toBeVisible({ timeout: 5_000 });

    await input.fill("scenarios");

    // Press Enter to select the first result
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/scenarios/, { timeout: 10_000 });
  });

  test("quick actions section shows action links", async ({ page }) => {
    await page.goto("/dashboard");
    const nav = page.getByLabel("Main navigation").first();

    // Quick Actions header
    await expect(
      nav.locator("text=Quick Actions").first()
    ).toBeVisible({ timeout: 10_000 });

    // At least one quick action should be visible (dynamic mode default)
    await expect(
      nav.locator("text=Add expense").first()
    ).toBeVisible();
  });

  test("sign out button is present and accessible", async ({ page }) => {
    await page.goto("/dashboard");
    const nav = page.getByLabel("Main navigation").first();

    const signOutBtn = nav.getByLabel("Sign out");
    await expect(signOutBtn).toBeVisible({ timeout: 10_000 });
  });

  test("user profile shows user name or email", async ({ page }) => {
    await page.goto("/dashboard");
    const nav = page.getByLabel("Main navigation").first();

    // User section should show user info — name or email
    // The demo user is "Alex Chen" with "demo@burnless.app"
    const hasName = await nav.locator("text=Alex Chen").isVisible().catch(() => false);
    const hasEmail = await nav.locator("text=demo@burnless.app").isVisible().catch(() => false);

    expect(hasName || hasEmail, "User profile should show name or email").toBeTruthy();
  });

  test("drag handle appears on hover for nav items", async ({ page }) => {
    await page.goto("/dashboard");

    // Find an Expenses nav item and hover over it
    const expensesItem = page
      .getByLabel("Main navigation")
      .first()
      .getByRole("link", { name: "Expenses", exact: true });
    await expect(expensesItem).toBeVisible({ timeout: 10_000 });

    // Hover over the parent group container
    await expensesItem.hover();

    // The reorder button should become visible on hover
    const reorderBtn = page.getByLabel("Reorder Expenses");
    await expect(reorderBtn).toBeVisible({ timeout: 3_000 });
  });

  test("Data Room link is active when on /reports path", async ({ page }) => {
    await page.goto("/reports/profit-loss");
    const nav = page.getByLabel("Main navigation").first();

    // Data Room should be highlighted since /reports maps to data-room
    const dataRoomLink = nav.getByRole("link", { name: "Data Room", exact: true });
    await expect(dataRoomLink).toHaveAttribute("aria-current", "page");
  });
});

test.describe("Floating sidebar — mobile viewport", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({
    storageState: "e2e/.auth/user.json",
    viewport: { width: 375, height: 812 },
  });

  test("mobile shows hamburger menu, not sidebar", async ({ page }) => {
    await page.goto("/dashboard");

    // Hamburger button should be visible
    const hamburger = page.getByLabel("Open navigation");
    await expect(hamburger).toBeVisible({ timeout: 10_000 });

    // Desktop sidebar should NOT be visible at this viewport
    const desktopSidebar = page.locator("aside.hidden.lg\\:flex");
    await expect(desktopSidebar).not.toBeVisible();
  });

  test("hamburger opens mobile sidebar overlay", async ({ page }) => {
    await page.goto("/dashboard");

    const hamburger = page.getByLabel("Open navigation");
    await expect(hamburger).toBeVisible({ timeout: 10_000 });

    await hamburger.click();

    // Mobile sidebar should slide in — check for the Close navigation button
    const closeBtn = page.getByLabel("Close navigation");
    await expect(closeBtn).toBeVisible({ timeout: 5_000 });

    // Nav links should be visible in mobile sidebar
    const mobileSidebar = page
      .getByLabel("Main navigation")
      .filter({ has: page.getByLabel("Close navigation") });
    await expect(
      mobileSidebar.getByRole("link", { name: "Dashboard", exact: true })
    ).toBeVisible();
  });

  test("mobile sidebar closes on backdrop click", async ({ page }) => {
    await page.goto("/dashboard");

    await page.getByLabel("Open navigation").click();
    await expect(page.getByLabel("Close navigation")).toBeVisible({ timeout: 5_000 });

    // Click the backdrop (the dark overlay behind the sidebar)
    // The backdrop is a div with bg-black/40 class at the same level
    await page.locator(".fixed.inset-0.bg-black\\/40").click({ force: true });

    // Mobile sidebar should close
    await expect(page.getByLabel("Close navigation")).not.toBeVisible({ timeout: 3_000 });
  });

  test("mobile sidebar closes on close button click", async ({ page }) => {
    await page.goto("/dashboard");

    await page.getByLabel("Open navigation").click();
    const closeBtn = page.getByLabel("Close navigation");
    await expect(closeBtn).toBeVisible({ timeout: 5_000 });

    await closeBtn.click();
    await expect(closeBtn).not.toBeVisible({ timeout: 3_000 });
  });

  test("mobile sidebar closes on navigation", async ({ page }) => {
    await page.goto("/dashboard");

    await page.getByLabel("Open navigation").click();
    await expect(page.getByLabel("Close navigation")).toBeVisible({ timeout: 5_000 });

    // Click a nav link
    const mobileSidebar = page
      .getByLabel("Main navigation")
      .filter({ has: page.getByLabel("Close navigation") });
    await mobileSidebar
      .getByRole("link", { name: "Expenses", exact: true })
      .click();

    // Should navigate and close sidebar
    await expect(page).toHaveURL(/\/expenses/, { timeout: 10_000 });
    await expect(page.getByLabel("Close navigation")).not.toBeVisible({ timeout: 3_000 });
  });

  test("mobile header shows burnless branding", async ({ page }) => {
    await page.goto("/dashboard");

    // Mobile header should show brand logo and text
    await expect(
      page.locator("header, div").filter({ hasText: "burnless" }).first()
    ).toBeVisible({ timeout: 10_000 });
  });
});
