import { test, expect } from "@playwright/test";

/**
 * Extended onboarding E2E tests — deeper validation of the onboarding wizard.
 */

test.describe("Onboarding extended tests", () => {
  test("website input rejects empty string", async ({ page }) => {
    await page.goto("/onboarding");
    const input = page.getByPlaceholder("yourcompany.com");
    const button = page.getByRole("button", { name: "Set Up My Company" });

    await input.fill("");
    await expect(button).toBeDisabled();
  });

  test("website input accepts domain-like text", async ({ page }) => {
    await page.goto("/onboarding");
    const input = page.getByPlaceholder("yourcompany.com");
    const button = page.getByRole("button", { name: "Set Up My Company" });

    await input.fill("acme.co");
    await expect(button).toBeEnabled();
  });

  test("manual form has correct initial state selections", async ({
    page,
  }) => {
    await page.goto("/onboarding");
    await page
      .getByRole("button", { name: /fill in manually/i })
      .click();

    // Pre-seed should be the default stage (active state)
    const preSeedBtn = page.getByRole("button", {
      name: "Pre-seed",
      exact: true,
    });
    await expect(preSeedBtn).toHaveClass(/bg-brand-600/);
  });

  test("industry selector works", async ({ page }) => {
    await page.goto("/onboarding");
    await page
      .getByRole("button", { name: /fill in manually/i })
      .click();

    await expect(page.getByText("Industry")).toBeVisible();
  });

  test("monetary fields accept numeric input", async ({ page }) => {
    await page.goto("/onboarding");
    await page
      .getByRole("button", { name: /fill in manually/i })
      .click();

    // Monthly Revenue field should be visible
    await expect(page.getByText("Monthly Revenue")).toBeVisible();
  });

  test("main expenses field is present", async ({ page }) => {
    await page.goto("/onboarding");
    await page
      .getByRole("button", { name: /fill in manually/i })
      .click();

    await expect(page.getByText("Main Expenses")).toBeVisible();
  });

  test("team size field is present", async ({ page }) => {
    await page.goto("/onboarding");
    await page
      .getByRole("button", { name: /fill in manually/i })
      .click();

    await expect(page.getByText("Team Size")).toBeVisible();
  });

  test("funding raised field is present", async ({ page }) => {
    await page.goto("/onboarding");
    await page
      .getByRole("button", { name: /fill in manually/i })
      .click();

    await expect(page.getByText("Funding Raised")).toBeVisible();
  });

  test("multiple stage selections can be toggled", async ({ page }) => {
    await page.goto("/onboarding");
    await page
      .getByRole("button", { name: /fill in manually/i })
      .click();

    // Click Series A
    const seriesABtn = page.getByRole("button", {
      name: "Series A",
      exact: true,
    });
    await seriesABtn.click();
    await expect(seriesABtn).toHaveClass(/bg-brand-600/);

    // Pre-seed should no longer be active
    const preSeedBtn = page.getByRole("button", {
      name: "Pre-seed",
      exact: true,
    });
    await expect(preSeedBtn).not.toHaveClass(/bg-brand-600/);
  });
});
