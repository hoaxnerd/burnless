import { test, expect } from "@playwright/test";

/**
 * AI Companion page E2E tests.
 * Smoke tests run without auth. Content tests gated behind DATABASE_URL.
 */

test.describe("AI Companion smoke tests", () => {
  test("AI companion page does not return 500", async ({ page }) => {
    const response = await page.goto("/ai", { waitUntil: "commit" });
    expect(response?.status()).toBeLessThan(500);
  });

  test("AI companion page redirects unauthenticated users", async ({
    page,
  }) => {
    await page.goto("/ai", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/login/);
  });
});

const dbAvailable = !!process.env.DATABASE_URL;

test.describe("AI Companion UI (requires auth)", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL for authenticated tests");

  test("shows AI Companion heading", async ({ page }) => {
    await page.goto("/ai");
    await expect(page.getByText("AI Companion")).toBeVisible();
  });

  test("shows welcome message on initial load", async ({ page }) => {
    await page.goto("/ai");
    await expect(
      page.getByText("I'm your AI financial companion")
    ).toBeVisible();
  });

  test("chat input placeholder is visible", async ({ page }) => {
    await page.goto("/ai");
    await expect(
      page.getByPlaceholder(
        "Ask about your financials, build a scenario, get advice..."
      )
    ).toBeVisible();
  });

  test("New Chat button is visible", async ({ page }) => {
    await page.goto("/ai");
    await expect(
      page.getByRole("button", { name: "New Chat" })
    ).toBeVisible();
  });

  test("History button is visible", async ({ page }) => {
    await page.goto("/ai");
    await expect(
      page.getByRole("button", { name: "History" })
    ).toBeVisible();
  });

  test("submit button is disabled when input is empty", async ({ page }) => {
    await page.goto("/ai");
    const submitButton = page.locator("button[type='submit']");
    await expect(submitButton).toBeDisabled();
  });

  test("submit button enables when text is typed", async ({ page }) => {
    await page.goto("/ai");
    const input = page.getByPlaceholder(
      "Ask about your financials, build a scenario, get advice..."
    );
    await input.fill("What is my runway?");
    const submitButton = page.locator("button[type='submit']");
    await expect(submitButton).toBeEnabled();
  });

  test("History panel toggles on button click", async ({ page }) => {
    await page.goto("/ai");
    await page.getByRole("button", { name: "History" }).click();
    await expect(page.getByText("Recent Conversations")).toBeVisible();
  });

  test("template cards are visible on empty state", async ({ page }) => {
    await page.goto("/ai");
    // Should show all 6 quick-start templates
    await expect(page.getByText("Monthly Briefing")).toBeVisible();
    await expect(page.getByText("Scenario Builder")).toBeVisible();
    await expect(page.getByText("Funding Analysis")).toBeVisible();
    await expect(page.getByText("Revenue Forecast")).toBeVisible();
    await expect(page.getByText("Hiring Impact")).toBeVisible();
    await expect(page.getByText("Board Prep")).toBeVisible();
  });

  test("clicking a template card fills the input", async ({ page }) => {
    await page.goto("/ai");
    // Click the Monthly Briefing template
    await page.getByText("Monthly Briefing").click();
    // Input should now contain the template prompt
    const input = page.getByPlaceholder(
      "Ask about your financials, build a scenario, get advice..."
    );
    const value = await input.inputValue();
    expect(value).toContain("financial briefing");
  });
});
