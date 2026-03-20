import { test, expect } from "@playwright/test";

/**
 * Auth flow E2E tests — login page UI behavior.
 *
 * Tests that don't require a database connection.
 * Full signup/signin integration tests are in auth-integration.spec.ts
 * and require DATABASE_URL to be set.
 */

test.describe("Login page UI", () => {
  test("login page renders correctly", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByText("Welcome to Burnless")).toBeVisible();
    await expect(page.getByPlaceholder("you@startup.com")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Google" })).toBeVisible();
    await expect(page.getByRole("button", { name: "GitHub" })).toBeVisible();
  });

  test("email field validation prevents empty submit", async ({ page }) => {
    await page.goto("/login");
    const button = page.getByRole("button", { name: "Continue" });
    // Button should be disabled when email is empty
    await expect(button).toBeDisabled();
  });

  test("continue button enables with valid email", async ({ page }) => {
    await page.goto("/login");

    const emailInput = page.getByPlaceholder("you@startup.com");
    const button = page.getByRole("button", { name: "Continue" });

    await expect(button).toBeDisabled();
    await emailInput.fill("test@example.com");
    await expect(button).toBeEnabled();
  });

  test("shows trust signals", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByText("256-bit SSL")).toBeVisible();
    await expect(page.getByText("SOC 2 ready")).toBeVisible();
  });
});

/**
 * Auth flow tests that require a database connection.
 * These are skipped unless DATABASE_URL is set.
 */
const dbAvailable = !!process.env.DATABASE_URL;

test.describe("Auth flow (requires DB)", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");

  const TEST_EMAIL = `e2e-${Date.now()}@burnless-test.com`;

  test("new user email shows signup form", async ({ page }) => {
    await page.goto("/login");

    await page.getByPlaceholder("you@startup.com").fill(TEST_EMAIL);
    await page.getByRole("button", { name: "Continue" }).click();

    // Should show signup form (new email)
    await expect(page.getByText("Create your account")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByPlaceholder("Jane Doe")).toBeVisible();
    await expect(page.getByPlaceholder("Min. 8 characters")).toBeVisible();
  });

  test("password strength indicator works", async ({ page }) => {
    await page.goto("/login");

    await page.getByPlaceholder("you@startup.com").fill(TEST_EMAIL);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Create your account")).toBeVisible({
      timeout: 10_000,
    });

    // Type short password
    await page.getByPlaceholder("Min. 8 characters").fill("short");
    await expect(page.getByText("Weak")).toBeVisible();

    // Type medium password
    await page.getByPlaceholder("Min. 8 characters").fill("mediumpass");
    await expect(page.getByText("Fair")).toBeVisible();

    // Type long password
    await page.getByPlaceholder("Min. 8 characters").fill("a-very-long-password-here");
    await expect(page.getByText("Strong")).toBeVisible();
  });

  test("back button returns to email step", async ({ page }) => {
    await page.goto("/login");

    await page.getByPlaceholder("you@startup.com").fill(TEST_EMAIL);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Create your account")).toBeVisible({
      timeout: 10_000,
    });

    await page.getByText("Use a different email").click();
    await expect(page.getByText("Welcome to Burnless")).toBeVisible();
  });
});
