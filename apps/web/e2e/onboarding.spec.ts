import { test, expect } from "@playwright/test";

/**
 * Onboarding E2E tests — the setup flow after signup.
 *
 * Tests the website → enrich → review → create flow.
 * Since these tests don't have auth, they test the onboarding UI in isolation.
 */

/** Click the "I'll fill in manually" button to skip enrichment and go to review form. */
async function clickSkipToForm(page: import("@playwright/test").Page) {
  await page
    .getByRole("button", { name: /fill in manually/i })
    .click();
}

test.describe("Onboarding flow", () => {
  test("onboarding page shows website entry step", async ({ page }) => {
    await page.goto("/onboarding");

    await expect(page.getByText("Welcome to burnless")).toBeVisible();
    await expect(page.getByPlaceholder("yourcompany.com")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Set Up My Company" })
    ).toBeDisabled();
  });

  test("skip button goes to manual form", async ({ page }) => {
    await page.goto("/onboarding");

    await clickSkipToForm(page);

    // Should show the review form
    await expect(
      page.getByText("Tell us about your company")
    ).toBeVisible();

    // Should have company name field (required)
    await expect(page.getByPlaceholder("My Startup Inc.")).toBeVisible();
  });

  test("manual form has all expected fields", async ({ page }) => {
    await page.goto("/onboarding");
    await clickSkipToForm(page);

    // All field labels should be present
    await expect(page.getByText("Company Name")).toBeVisible();
    await expect(page.getByText("Stage")).toBeVisible();
    await expect(page.getByText("Business Model")).toBeVisible();
    await expect(page.getByText("Industry")).toBeVisible();
    await expect(page.getByText("Monthly Revenue")).toBeVisible();
    await expect(page.getByText("Team Size")).toBeVisible();
    await expect(page.getByText("Funding Raised")).toBeVisible();
    await expect(page.getByText("Main Expenses")).toBeVisible();
  });

  test("stage selector works", async ({ page }) => {
    await page.goto("/onboarding");
    await clickSkipToForm(page);

    // Default is Pre-seed — click Seed
    const seedBtn = page.getByRole("button", { name: "Seed", exact: true });
    await seedBtn.click();

    // Seed button should now have brand styling (active)
    await expect(seedBtn).toHaveClass(/bg-brand-600/);
  });

  test("business model selector works", async ({ page }) => {
    await page.goto("/onboarding");
    await clickSkipToForm(page);

    // Click Marketplace
    const marketplaceBtn = page.getByRole("button", {
      name: "Marketplace",
      exact: true,
    });
    await marketplaceBtn.click();
    await expect(marketplaceBtn).toHaveClass(/bg-brand-600/);
  });

  test("create button requires company name", async ({ page }) => {
    await page.goto("/onboarding");
    await clickSkipToForm(page);

    // Clear company name (should be empty by default)
    const nameInput = page.getByPlaceholder("My Startup Inc.");
    await nameInput.fill("");

    // Click create
    await page.getByRole("button", { name: "Create My Company" }).click();

    // Should show error
    await expect(page.getByText("Company name is required")).toBeVisible();
  });

  test("website URL enables submit button", async ({ page }) => {
    await page.goto("/onboarding");

    const input = page.getByPlaceholder("yourcompany.com");
    const button = page.getByRole("button", { name: "Set Up My Company" });

    // Initially disabled
    await expect(button).toBeDisabled();

    // Type URL
    await input.fill("example.com");

    // Should be enabled now
    await expect(button).toBeEnabled();
  });
});
