import { test, expect } from "@playwright/test";

/**
 * Scenarios page E2E tests.
 * Smoke tests run without auth. Content tests gated behind DATABASE_URL.
 */

test.describe("Scenarios smoke tests", () => {
  test("scenarios page does not return 500", async ({ page }) => {
    const response = await page.goto("/scenarios", { waitUntil: "commit" });
    expect(response?.status()).toBeLessThan(500);
  });

  test("scenarios page redirects unauthenticated users", async ({ page }) => {
    await page.goto("/scenarios", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/login/);
  });

  test("scenario detail page does not return 500", async ({ page }) => {
    const response = await page.goto("/scenarios/test-id", {
      waitUntil: "commit",
    });
    expect(response?.status()).toBeLessThan(500);
  });

  test("scenario compare page does not return 500", async ({ page }) => {
    const response = await page.goto("/scenarios/compare", {
      waitUntil: "commit",
    });
    expect(response?.status()).toBeLessThan(500);
  });
});

const dbAvailable = !!process.env.DATABASE_URL;

test.describe("Scenarios UI (requires auth)", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL for authenticated tests");

  test("renders Scenarios heading", async ({ page }) => {
    await page.goto("/scenarios");
    await expect(
      page.getByRole("heading", { name: "Scenarios" })
    ).toBeVisible();
  });

  test("Create Scenario button is visible", async ({ page }) => {
    await page.goto("/scenarios");
    await expect(
      page.getByRole("button", { name: "Create Scenario" })
    ).toBeVisible();
  });

  test("Create Scenario dialog shows templates", async ({ page }) => {
    await page.goto("/scenarios");
    await page.getByRole("button", { name: "Create Scenario" }).click();
    await expect(page.getByText("Best Case")).toBeVisible();
    await expect(page.getByText("Worst Case")).toBeVisible();
    await expect(page.getByText("Fundraise Scenario")).toBeVisible();
    await expect(page.getByText("Growth Acceleration")).toBeVisible();
    await expect(page.getByText("Lean Operations")).toBeVisible();
    await expect(page.getByText("Hiring Plan")).toBeVisible();
  });

  test("subtitle text describes the page purpose", async ({ page }) => {
    await page.goto("/scenarios");
    await expect(
      page.getByText("Model different futures for your business")
    ).toBeVisible();
  });
});
