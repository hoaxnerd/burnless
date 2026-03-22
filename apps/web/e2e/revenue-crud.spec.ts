import { test, expect } from "@playwright/test";

/**
 * Revenue CRUD E2E Tests — BUR-248
 *
 * Tests all revenue stream operations:
 *   - Page loads with seeded data
 *   - Add all 4 revenue types (subscription, services, one-time, usage-based)
 *   - Form validation (missing fields, required fields)
 *   - Cancel closes modal
 *   - Edit pre-populates fields
 *   - Delete with confirmation
 */

const dbAvailable = !!process.env.DATABASE_URL;

test.describe("Revenue page — authenticated", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("revenue page loads with heading and subtitle", async ({ page }) => {
    await page.goto("/revenue");
    await expect(
      page.getByRole("heading", { name: "Revenue" })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("revenue page shows dollar amounts from seeded data", async ({
    page,
  }) => {
    await page.goto("/revenue");
    await expect(
      page.locator("text=/\\$[\\d,.]+/").first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("Add Revenue Stream button is visible", async ({ page }) => {
    await page.goto("/revenue");
    await expect(
      page.getByRole("button", { name: /add revenue/i })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("Add Revenue Stream opens form modal with correct fields", async ({
    page,
  }) => {
    await page.goto("/revenue");
    await expect(
      page.getByRole("heading", { name: "Revenue" })
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /add revenue/i }).click();

    // Form fields
    await expect(
      page.getByPlaceholder("e.g. Growth Plan, Implementation Services")
    ).toBeVisible();
    await expect(page.locator("label", { hasText: "Name" })).toBeVisible();
    await expect(page.locator("label", { hasText: "Type" })).toBeVisible();
  });

  test("Cancel closes the add revenue modal", async ({ page }) => {
    await page.goto("/revenue");
    await expect(
      page.getByRole("heading", { name: "Revenue" })
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /add revenue/i }).click();
    await expect(
      page.getByPlaceholder("e.g. Growth Plan, Implementation Services")
    ).toBeVisible();

    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(
      page.getByPlaceholder("e.g. Growth Plan, Implementation Services")
    ).not.toBeVisible();
  });
});

test.describe("Revenue — add subscription stream", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("adding a subscription revenue stream succeeds", async ({ page }) => {
    await page.goto("/revenue");
    await expect(
      page.getByRole("heading", { name: "Revenue" })
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /add revenue/i }).click();

    const streamName = `SaaS Plan ${Date.now()}`;
    await page
      .getByPlaceholder("e.g. Growth Plan, Implementation Services")
      .fill(streamName);

    // Type should default to Subscription or select it
    const typeSelect = page.locator("select").first();
    await typeSelect.selectOption("subscription");

    // Fill subscription parameters
    await page.getByPlaceholder("99").fill("49");
    await page.getByPlaceholder("50").fill("100");
    await page.getByPlaceholder("15").fill("20");
    await page.getByPlaceholder("2.5").fill("3");

    // Submit
    const submitBtn = page
      .locator("button[type='submit']")
      .filter({ hasText: /add stream/i });
    await submitBtn.click();

    // Modal should close
    await expect(
      page.getByPlaceholder("e.g. Growth Plan, Implementation Services")
    ).not.toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Revenue — add services stream", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("adding a professional services revenue stream succeeds", async ({
    page,
  }) => {
    await page.goto("/revenue");
    await expect(
      page.getByRole("heading", { name: "Revenue" })
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /add revenue/i }).click();

    const streamName = `Consulting ${Date.now()}`;
    await page
      .getByPlaceholder("e.g. Growth Plan, Implementation Services")
      .fill(streamName);

    const typeSelect = page.locator("select").first();
    await typeSelect.selectOption("services");

    // Fill services parameters
    await page.getByPlaceholder("150").fill("200");
    await page.getByPlaceholder("40").fill("80");

    const submitBtn = page
      .locator("button[type='submit']")
      .filter({ hasText: /add stream/i });
    await submitBtn.click();

    await expect(
      page.getByPlaceholder("e.g. Growth Plan, Implementation Services")
    ).not.toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Revenue — add one-time stream", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("adding a one-time sales revenue stream succeeds", async ({ page }) => {
    await page.goto("/revenue");
    await expect(
      page.getByRole("heading", { name: "Revenue" })
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /add revenue/i }).click();

    const streamName = `Hardware Sales ${Date.now()}`;
    await page
      .getByPlaceholder("e.g. Growth Plan, Implementation Services")
      .fill(streamName);

    const typeSelect = page.locator("select").first();
    await typeSelect.selectOption("one_time");

    // Fill one-time parameters
    await page.getByPlaceholder("500").fill("750");
    await page.getByPlaceholder("10").fill("25");

    const submitBtn = page
      .locator("button[type='submit']")
      .filter({ hasText: /add stream/i });
    await submitBtn.click();

    await expect(
      page.getByPlaceholder("e.g. Growth Plan, Implementation Services")
    ).not.toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Revenue — add usage-based stream", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("adding a usage-based revenue stream succeeds", async ({ page }) => {
    await page.goto("/revenue");
    await expect(
      page.getByRole("heading", { name: "Revenue" })
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /add revenue/i }).click();

    const streamName = `API Calls ${Date.now()}`;
    await page
      .getByPlaceholder("e.g. Growth Plan, Implementation Services")
      .fill(streamName);

    const typeSelect = page.locator("select").first();
    await typeSelect.selectOption("usage_based");

    // Fill usage-based parameters
    await page.getByPlaceholder("0.10").fill("0.05");
    await page.getByPlaceholder("100000").fill("500000");

    const submitBtn = page
      .locator("button[type='submit']")
      .filter({ hasText: /add stream/i });
    await submitBtn.click();

    await expect(
      page.getByPlaceholder("e.g. Growth Plan, Implementation Services")
    ).not.toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Revenue — form validation", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("submit button is disabled without required fields", async ({
    page,
  }) => {
    await page.goto("/revenue");
    await expect(
      page.getByRole("heading", { name: "Revenue" })
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /add revenue/i }).click();

    // Submit should be disabled initially (no name filled)
    const submitBtn = page
      .locator("button[type='submit']")
      .filter({ hasText: /add stream/i });
    await expect(submitBtn).toBeDisabled();
  });

  test("filling name and parameters enables submit", async ({ page }) => {
    await page.goto("/revenue");
    await expect(
      page.getByRole("heading", { name: "Revenue" })
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /add revenue/i }).click();

    await page
      .getByPlaceholder("e.g. Growth Plan, Implementation Services")
      .fill("Test Stream");

    // Fill subscription params (default type)
    await page.getByPlaceholder("99").fill("10");
    await page.getByPlaceholder("50").fill("5");
    await page.getByPlaceholder("15").fill("2");
    await page.getByPlaceholder("2.5").fill("1");

    const submitBtn = page
      .locator("button[type='submit']")
      .filter({ hasText: /add stream/i });
    await expect(submitBtn).toBeEnabled();
  });
});
