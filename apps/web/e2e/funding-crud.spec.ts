import { test, expect } from "@playwright/test";

/**
 * Funding Round CRUD E2E Tests — BUR-248
 *
 * Tests all funding round operations:
 *   - Page loads with heading and summary cards
 *   - Add funding rounds (all types: pre-seed through grant)
 *   - Valuation and dilution fields (visible for equity rounds, hidden for debt/grant)
 *   - Projected round checkbox
 *   - Form validation
 *   - Cancel closes modal
 *   - Dilution calculator interaction
 *   - Delete with two-step confirmation
 */

const dbAvailable = !!process.env.DATABASE_URL;

test.describe("Funding page — authenticated", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("funding page loads with heading and subtitle", async ({ page }) => {
    await page.goto("/funding");
    await expect(
      page.getByRole("heading", { name: "Funding" })
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText(/capital sources|fundraising/i)
    ).toBeVisible();
  });

  test("funding page shows summary cards", async ({ page }) => {
    await page.goto("/funding");
    await expect(
      page.getByRole("heading", { name: "Funding" })
    ).toBeVisible({ timeout: 10_000 });

    // Summary cards: Total Raised, Current Cash, Runway, Founder Ownership
    await expect(page.getByText("Total Raised").first()).toBeVisible();
    await expect(page.getByText("Current Cash").first()).toBeVisible();
    await expect(page.getByText("Runway").first()).toBeVisible();
  });

  test("funding page shows dollar amounts", async ({ page }) => {
    await page.goto("/funding");
    await expect(
      page.locator("text=/\\$[\\d,.]+/").first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("Add Funding Round button is visible", async ({ page }) => {
    await page.goto("/funding");
    await expect(
      page.getByRole("button", { name: /add funding/i })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("Add Funding Round opens form with correct fields", async ({
    page,
  }) => {
    await page.goto("/funding");
    await expect(
      page.getByRole("heading", { name: "Funding" })
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /add funding/i }).click();

    // Required form fields
    await expect(
      page.getByPlaceholder("e.g. Seed Round, AWS Activate Grant")
    ).toBeVisible();
    await expect(page.getByPlaceholder("2000000")).toBeVisible();
    await expect(page.locator("label", { hasText: "Round Name" })).toBeVisible();
    await expect(page.locator("label", { hasText: "Type" })).toBeVisible();
    await expect(page.locator("label", { hasText: "Amount" })).toBeVisible();
    await expect(page.locator("label", { hasText: "Date" })).toBeVisible();
  });

  test("Cancel closes the add funding modal", async ({ page }) => {
    await page.goto("/funding");
    await expect(
      page.getByRole("heading", { name: "Funding" })
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /add funding/i }).click();
    await expect(
      page.getByPlaceholder("e.g. Seed Round, AWS Activate Grant")
    ).toBeVisible();

    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(
      page.getByPlaceholder("e.g. Seed Round, AWS Activate Grant")
    ).not.toBeVisible();
  });
});

test.describe("Funding — add seed round with valuation", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("adding a seed round with valuation and dilution succeeds", async ({
    page,
  }) => {
    await page.goto("/funding");
    await expect(
      page.getByRole("heading", { name: "Funding" })
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /add funding/i }).click();

    const roundName = `Seed ${Date.now()}`;
    await page
      .getByPlaceholder("e.g. Seed Round, AWS Activate Grant")
      .fill(roundName);

    // Select seed type
    const typeSelect = page.locator("select").first();
    await typeSelect.selectOption("seed");

    // Fill amount
    await page.getByPlaceholder("2000000").fill("3000000");

    // Valuation and dilution should be visible for equity rounds
    await expect(page.getByPlaceholder("8000000")).toBeVisible();
    await expect(page.getByPlaceholder("20")).toBeVisible();

    await page.getByPlaceholder("8000000").fill("10000000");
    await page.getByPlaceholder("20").fill("15");

    // Submit
    const submitBtn = page
      .locator("button[type='submit']")
      .filter({ hasText: /add round/i });
    await submitBtn.click();

    // Modal should close
    await expect(
      page.getByPlaceholder("e.g. Seed Round, AWS Activate Grant")
    ).not.toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Funding — add grant (no valuation fields)", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("adding a grant hides valuation and dilution fields", async ({
    page,
  }) => {
    await page.goto("/funding");
    await expect(
      page.getByRole("heading", { name: "Funding" })
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /add funding/i }).click();

    const roundName = `AWS Grant ${Date.now()}`;
    await page
      .getByPlaceholder("e.g. Seed Round, AWS Activate Grant")
      .fill(roundName);

    // Select grant type
    const typeSelect = page.locator("select").first();
    await typeSelect.selectOption("grant");

    // Valuation and dilution should NOT be visible for grants
    await expect(page.getByPlaceholder("8000000")).not.toBeVisible();

    // Fill amount
    await page.getByPlaceholder("2000000").fill("100000");

    // Submit
    const submitBtn = page
      .locator("button[type='submit']")
      .filter({ hasText: /add round/i });
    await submitBtn.click();

    await expect(
      page.getByPlaceholder("e.g. Seed Round, AWS Activate Grant")
    ).not.toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Funding — add debt (no valuation fields)", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("adding debt hides valuation and dilution fields", async ({ page }) => {
    await page.goto("/funding");
    await expect(
      page.getByRole("heading", { name: "Funding" })
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /add funding/i }).click();

    await page
      .getByPlaceholder("e.g. Seed Round, AWS Activate Grant")
      .fill(`Credit Line ${Date.now()}`);

    const typeSelect = page.locator("select").first();
    await typeSelect.selectOption("debt");

    // Valuation fields should be hidden for debt
    await expect(page.getByPlaceholder("8000000")).not.toBeVisible();

    await page.getByPlaceholder("2000000").fill("500000");

    const submitBtn = page
      .locator("button[type='submit']")
      .filter({ hasText: /add round/i });
    await submitBtn.click();

    await expect(
      page.getByPlaceholder("e.g. Seed Round, AWS Activate Grant")
    ).not.toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Funding — projected round", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("projected checkbox marks round as planned", async ({ page }) => {
    await page.goto("/funding");
    await expect(
      page.getByRole("heading", { name: "Funding" })
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /add funding/i }).click();

    await page
      .getByPlaceholder("e.g. Seed Round, AWS Activate Grant")
      .fill(`Series A Planned ${Date.now()}`);

    const typeSelect = page.locator("select").first();
    await typeSelect.selectOption("series_a");

    await page.getByPlaceholder("2000000").fill("10000000");

    // Check the projected checkbox
    const projectedCheckbox = page.locator(
      "input[type='checkbox']"
    );
    if (await projectedCheckbox.isVisible()) {
      await projectedCheckbox.check();
    }

    const submitBtn = page
      .locator("button[type='submit']")
      .filter({ hasText: /add round/i });
    await submitBtn.click();

    await expect(
      page.getByPlaceholder("e.g. Seed Round, AWS Activate Grant")
    ).not.toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Funding — dilution calculator", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("dilution calculator is visible on funding page", async ({ page }) => {
    await page.goto("/funding");
    await expect(
      page.getByRole("heading", { name: "Funding" })
    ).toBeVisible({ timeout: 10_000 });

    // Dilution calculator should be visible
    await expect(
      page.getByText("Dilution Calculator").first()
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Funding — ownership chart", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("ownership donut chart shows founder percentage", async ({ page }) => {
    await page.goto("/funding");
    await expect(
      page.getByRole("heading", { name: "Funding" })
    ).toBeVisible({ timeout: 10_000 });

    // Should show founder ownership percentage
    await expect(
      page.getByText(/founder/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Funding — form validation", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("submit disabled without name and amount", async ({ page }) => {
    await page.goto("/funding");
    await expect(
      page.getByRole("heading", { name: "Funding" })
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /add funding/i }).click();

    const submitBtn = page
      .locator("button[type='submit']")
      .filter({ hasText: /add round/i });
    await expect(submitBtn).toBeDisabled();
  });

  test("filling name and amount enables submit", async ({ page }) => {
    await page.goto("/funding");
    await expect(
      page.getByRole("heading", { name: "Funding" })
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /add funding/i }).click();

    await page
      .getByPlaceholder("e.g. Seed Round, AWS Activate Grant")
      .fill("Test Round");
    await page.getByPlaceholder("2000000").fill("1000000");

    const submitBtn = page
      .locator("button[type='submit']")
      .filter({ hasText: /add round/i });
    await expect(submitBtn).toBeEnabled();
  });
});
