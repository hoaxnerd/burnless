import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/user.json" });

/**
 * Onboarding UX Simplification E2E Tests — BUR-193 / BUR-182
 *
 * Tests the redesigned onboarding flow with:
 *   - 3-section card layout (Company Identity, Financials, Team & Operations)
 *   - Progress indicator (Step 2 of 3)
 *   - Skip all / I'll do this later buttons
 *   - Section card grouping with icons
 *   - Dollar prefix on financial fields
 *   - Toggle groups for Stage and Business Model
 *   - AI confidence badges (purple borders)
 *   - Inline field layout
 */

test.describe("Onboarding redesigned review step", () => {
  test("review step shows 3 section cards with correct titles", async ({
    page,
  }) => {
    await page.goto("/onboarding");
    await expect(
      page.getByPlaceholder("yourcompany.com")
    ).toBeVisible({ timeout: 10_000 });

    // Skip to manual form
    await page.getByRole("button", { name: /fill in manually/i }).click();

    // Wait for review step to load
    await expect(
      page.getByText(/tell us about your company|verify your details/i).first()
    ).toBeVisible({ timeout: 10_000 });

    // 3 section cards
    await expect(page.getByText("Company Identity")).toBeVisible();
    await expect(page.getByText("Financials")).toBeVisible();
    await expect(page.getByText("Team & Operations")).toBeVisible();
  });

  test("progress indicator shows Step 2 of 3", async ({ page }) => {
    await page.goto("/onboarding");
    await page.getByRole("button", { name: /fill in manually/i }).click();

    await expect(page.getByText("Step 2 of 3")).toBeVisible({ timeout: 10_000 });
  });

  test("progress bar shows 2 of 3 steps filled", async ({ page }) => {
    await page.goto("/onboarding");
    await page.getByRole("button", { name: /fill in manually/i }).click();

    // Two filled segments (brand-600) and one unfilled (surface-200)
    const filledBars = page.locator(".bg-brand-600.rounded-full.h-2.w-8");
    await expect(filledBars).toHaveCount(2);
  });

  test("'Skip all' button navigates to dashboard", async ({ page }) => {
    await page.goto("/onboarding");
    await page.getByRole("button", { name: /fill in manually/i }).click();

    await expect(page.getByText("Step 2 of 3")).toBeVisible({ timeout: 10_000 });

    // "Skip all" button in top-right corner
    await page
      .locator("button")
      .filter({ hasText: /skip all/i })
      .first()
      .click();

    // Should go to the Done step and show success
    await expect(page.getByText(/you're all set/i)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /go to dashboard/i }).click();

    // Should navigate to dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("'I'll do this later' button is present below Create", async ({
    page,
  }) => {
    await page.goto("/onboarding");
    await page.getByRole("button", { name: /fill in manually/i }).click();

    await expect(
      page.getByText(/tell us about your company|verify your details/i).first()
    ).toBeVisible({ timeout: 10_000 });

    // "I'll do this later" button
    await expect(
      page.locator("button", { hasText: /I.ll do this later/i })
    ).toBeVisible();
  });

  test("Company Identity section has all expected fields", async ({
    page,
  }) => {
    await page.goto("/onboarding");
    await page.getByRole("button", { name: /fill in manually/i }).click();

    await expect(page.getByText("Company Identity")).toBeVisible({
      timeout: 10_000,
    });

    // Company Name (required, with *)
    await expect(page.getByPlaceholder("My Startup Inc.")).toBeVisible();

    // Stage toggle buttons
    await expect(
      page.getByRole("button", { name: "Pre-seed", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Seed", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Series A", exact: true })
    ).toBeVisible();

    // Business Model toggle buttons
    await expect(
      page.getByRole("button", { name: "SaaS", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Marketplace", exact: true })
    ).toBeVisible();

    // Industry field
    await expect(page.getByText("Industry")).toBeVisible();
  });

  test("Financials section has dollar-prefixed fields", async ({ page }) => {
    await page.goto("/onboarding");
    await page.getByRole("button", { name: /fill in manually/i }).click();

    await expect(page.getByText("Financials")).toBeVisible({
      timeout: 10_000,
    });

    // Dollar sign prefix should be visible
    const dollarSigns = page.locator("span", { hasText: "$" });
    const count = await dollarSigns.count();
    expect(count, "Should have dollar sign prefixes on financial fields").toBeGreaterThanOrEqual(2);

    // Monthly Revenue and Funding Raised fields
    await expect(page.getByText("Monthly Revenue")).toBeVisible();
    await expect(page.getByText("Funding Raised")).toBeVisible();
  });

  test("Team & Operations section has expected fields", async ({ page }) => {
    await page.goto("/onboarding");
    await page.getByRole("button", { name: /fill in manually/i }).click();

    await expect(page.getByText("Team & Operations")).toBeVisible({
      timeout: 10_000,
    });

    await expect(page.getByText("Team Size")).toBeVisible();
    await expect(page.getByText("Main Expenses")).toBeVisible();
  });

  test("stage toggle buttons switch selection", async ({ page }) => {
    await page.goto("/onboarding");
    await page.getByRole("button", { name: /fill in manually/i }).click();

    await expect(page.getByText("Company Identity")).toBeVisible({
      timeout: 10_000,
    });

    // Default is Pre-seed — click Series A
    const seriesA = page.getByRole("button", { name: "Series A", exact: true });
    await seriesA.click();

    // Series A should now have active styling (bg-brand-600)
    await expect(seriesA).toHaveClass(/bg-brand-600/);

    // Pre-seed should no longer have active styling
    const preSeed = page.getByRole("button", {
      name: "Pre-seed",
      exact: true,
    });
    await expect(preSeed).not.toHaveClass(/bg-brand-600/);
  });

  test("business model toggle buttons switch selection", async ({ page }) => {
    await page.goto("/onboarding");
    await page.getByRole("button", { name: /fill in manually/i }).click();

    await expect(page.getByText("Company Identity")).toBeVisible({
      timeout: 10_000,
    });

    // Default is SaaS — click E-commerce
    const ecommerce = page.getByRole("button", {
      name: "E-commerce",
      exact: true,
    });
    await ecommerce.click();

    await expect(ecommerce).toHaveClass(/bg-brand-600/);

    const saas = page.getByRole("button", { name: "SaaS", exact: true });
    await expect(saas).not.toHaveClass(/bg-brand-600/);
  });

  test("'Create My Company' button is visible", async ({ page }) => {
    await page.goto("/onboarding");
    await page.getByRole("button", { name: /fill in manually/i }).click();

    await expect(
      page.getByRole("button", { name: "Create My Company" })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("company name validation — empty name shows error", async ({
    page,
  }) => {
    await page.goto("/onboarding");
    await page.getByRole("button", { name: /fill in manually/i }).click();

    await expect(
      page.getByRole("button", { name: "Create My Company" })
    ).toBeVisible({ timeout: 10_000 });

    // Clear the company name field
    await page.getByPlaceholder("My Startup Inc.").fill("");

    // Click Create
    await page.getByRole("button", { name: "Create My Company" }).click();

    // Should show error
    await expect(
      page.getByText("Company name is required").first()
    ).toBeVisible();
  });

  test("number fields accept numeric input correctly", async ({ page }) => {
    await page.goto("/onboarding");
    await page.getByRole("button", { name: /fill in manually/i }).click();

    await expect(page.getByText("Financials")).toBeVisible({
      timeout: 10_000,
    });

    // Find Monthly Revenue input (has $ prefix, type=number)
    const revenueInputs = page.locator("input[type='number']");
    const firstNumInput = revenueInputs.first();
    await firstNumInput.fill("50000");
    await expect(firstNumInput).toHaveValue("50000");
  });

  test("helper text below create button mentions Settings", async ({
    page,
  }) => {
    await page.goto("/onboarding");
    await page.getByRole("button", { name: /fill in manually/i }).click();

    await expect(
      page.getByText("You can always fill this in from Settings")
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Onboarding — website step redesign", () => {
  test("website step shows 'Skip — I'll fill in manually' button", async ({
    page,
  }) => {
    await page.goto("/onboarding");

    await expect(
      page.getByRole("button", { name: /fill in manually/i })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("website step shows 'Skip all' button", async ({ page }) => {
    await page.goto("/onboarding");

    await expect(
      page.locator("button", { hasText: /skip all/i }).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("website step — entering URL enables submit", async ({ page }) => {
    await page.goto("/onboarding");

    const input = page.getByPlaceholder("yourcompany.com");
    const button = page.getByRole("button", { name: "Set Up My Company" });

    await expect(button).toBeDisabled();
    await input.fill("testcompany.io");
    await expect(button).toBeEnabled();
  });
});
