import { test, expect } from "@playwright/test";

/**
 * Extended login page E2E tests — deeper validation of login page behavior.
 */

test.describe("Login page extended tests", () => {
  test("renders the logo and branding", async ({ page }) => {
    await page.goto("/login");
    // Page title or heading should reference burnless
    await expect(page.getByText("Welcome to burnless")).toBeVisible();
  });

  test("email input accepts valid email format", async ({ page }) => {
    await page.goto("/login");
    const emailInput = page.getByPlaceholder("you@startup.com");

    await emailInput.fill("founder@mycompany.io");
    await expect(
      page.getByRole("button", { name: "Continue" })
    ).toBeEnabled();
  });

  test("social login buttons are visible", async ({ page }) => {
    await page.goto("/login");
    await expect(
      page.getByRole("button", { name: "Google" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "GitHub" })
    ).toBeVisible();
  });

  test("social login separator text is shown", async ({ page }) => {
    await page.goto("/login");
    // "Or continue with" or "or" separator between email and social buttons
    await expect(page.getByText(/or/i)).toBeVisible();
  });

  test("page has proper title or heading structure", async ({ page }) => {
    await page.goto("/login");
    const heading = page.locator("h1, h2, h3").first();
    await expect(heading).toBeVisible();
  });

  test("email input has correct type attribute", async ({ page }) => {
    await page.goto("/login");
    const emailInput = page.getByPlaceholder("you@startup.com");
    await expect(emailInput).toHaveAttribute("type", "email");
  });

  test("trust signals section is visible with all badges", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(page.getByText("256-bit SSL")).toBeVisible();
    await expect(page.getByText("SOC 2 ready")).toBeVisible();
  });

  test("continue button transitions from disabled to enabled correctly", async ({
    page,
  }) => {
    await page.goto("/login");
    const emailInput = page.getByPlaceholder("you@startup.com");
    const button = page.getByRole("button", { name: "Continue" });

    // Start disabled
    await expect(button).toBeDisabled();

    // Type email → enabled
    await emailInput.fill("test@example.com");
    await expect(button).toBeEnabled();

    // Clear email → disabled again
    await emailInput.fill("");
    await expect(button).toBeDisabled();
  });
});
