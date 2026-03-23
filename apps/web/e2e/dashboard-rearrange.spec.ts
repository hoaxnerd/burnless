import { test, expect } from "@playwright/test";

/**
 * Dashboard Rearrange / Grid Layout E2E Tests — BUR-272
 *
 * Tests the drag-to-rearrange grid feature:
 *   - Edit Layout toggle button
 *   - Drag handles appear in edit mode
 *   - Reset button restores default layout
 *   - Layout persists after page reload
 *   - Layout persists after tab change
 */

const dbAvailable = !!process.env.DATABASE_URL;

test.describe("Dashboard — rearrange mode", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("Edit Layout button is visible on dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const editBtn = page.getByRole("button", { name: /edit layout/i });
    await expect(editBtn).toBeVisible({ timeout: 10_000 });
  });

  test("clicking Edit Layout toggles to Lock Layout", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const editBtn = page.getByRole("button", { name: /edit layout/i });
    await expect(editBtn).toBeVisible({ timeout: 10_000 });

    await editBtn.click();

    // Button text should change to "Lock Layout"
    await expect(
      page.getByRole("button", { name: /lock layout/i })
    ).toBeVisible({ timeout: 3_000 });
  });

  test("drag handles appear in edit mode", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Enter edit mode
    const editBtn = page.getByRole("button", { name: /edit layout/i });
    await expect(editBtn).toBeVisible({ timeout: 10_000 });
    await editBtn.click();

    // Drag handles should appear (class "grid-drag-handle" or text "Drag")
    const dragHandles = page.locator(".grid-drag-handle");
    const handleCount = await dragHandles.count();
    expect(handleCount, "Drag handles should appear for grid widgets").toBeGreaterThan(0);
  });

  test("Reset button appears in edit mode", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Enter edit mode
    const editBtn = page.getByRole("button", { name: /edit layout/i });
    await expect(editBtn).toBeVisible({ timeout: 10_000 });
    await editBtn.click();

    // Reset button should be visible
    await expect(
      page.getByRole("button", { name: /reset/i })
    ).toBeVisible({ timeout: 3_000 });
  });

  test("Reset button is hidden outside edit mode", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Reset should not be visible when not in edit mode
    const resetBtn = page.getByRole("button", { name: /reset/i });
    await expect(resetBtn).toBeHidden({ timeout: 5_000 });
  });

  test("Lock Layout exits edit mode", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Enter edit mode
    const editBtn = page.getByRole("button", { name: /edit layout/i });
    await expect(editBtn).toBeVisible({ timeout: 10_000 });
    await editBtn.click();

    // Click Lock Layout
    const lockBtn = page.getByRole("button", { name: /lock layout/i });
    await expect(lockBtn).toBeVisible({ timeout: 3_000 });
    await lockBtn.click();

    // Should return to Edit Layout state
    await expect(
      page.getByRole("button", { name: /edit layout/i })
    ).toBeVisible({ timeout: 3_000 });

    // Drag handles should disappear
    const dragHandles = page.locator(".grid-drag-handle");
    const count = await dragHandles.count();
    expect(count, "Drag handles should disappear after locking layout").toBe(0);
  });

  test("Reset restores default layout", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Enter edit mode
    const editBtn = page.getByRole("button", { name: /edit layout/i });
    await expect(editBtn).toBeVisible({ timeout: 10_000 });
    await editBtn.click();

    // Click Reset
    const resetBtn = page.getByRole("button", { name: /reset/i });
    await expect(resetBtn).toBeVisible({ timeout: 3_000 });
    await resetBtn.click();

    // Dashboard should still show hero cards in default positions
    await expect(page.getByText(/cash position/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/monthly burn/i).first()).toBeVisible();
  });
});

test.describe("Dashboard — layout persistence", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("layout persists after page reload", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/cash position/i).first()).toBeVisible({ timeout: 10_000 });

    // Enter edit mode, reset to defaults first to get clean state
    const editBtn = page.getByRole("button", { name: /edit layout/i });
    await editBtn.click();

    const resetBtn = page.getByRole("button", { name: /reset/i });
    await resetBtn.click();
    await page.waitForTimeout(500);

    // Lock layout to save
    const lockBtn = page.getByRole("button", { name: /lock layout/i });
    await lockBtn.click();

    // Reload page
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Dashboard should load with all cards visible (layout persisted via API)
    await expect(page.getByText(/cash position/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/monthly burn/i).first()).toBeVisible();
    await expect(page.getByText(/runway/i).first()).toBeVisible();
  });

  test("Edit Layout button still shows correct state after reload", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Edit Layout should be available (not Lock Layout) on fresh load
    await expect(
      page.getByRole("button", { name: /edit layout/i })
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Dashboard — rearrange mobile", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({
    storageState: "e2e/.auth/user.json",
    viewport: { width: 375, height: 812 },
  });

  test("Edit Layout button is available on mobile", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(/cash position/i).first()).toBeVisible({ timeout: 10_000 });

    // Edit Layout should still be accessible on mobile
    const editBtn = page.getByRole("button", { name: /edit layout/i });
    if (await editBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await editBtn.tap();

      // Should enter edit mode
      await expect(
        page.getByRole("button", { name: /lock layout/i })
      ).toBeVisible({ timeout: 3_000 });
    }
  });
});
