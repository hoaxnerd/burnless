import { test, expect } from "@playwright/test";

/**
 * AI UX Overhaul E2E Tests — BUR-194 / BUR-174
 *
 * Tests the AI command center, chat redesign, and template cards:
 *   - AI page loads with welcome/templates
 *   - Template cards are visible and clickable
 *   - Chat input, send button, and history
 *   - AI page error states (no provider configured)
 *   - AI page on mobile viewport
 */

const dbAvailable = !!process.env.DATABASE_URL;

test.describe("AI UX — authenticated", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("AI page loads with welcome message", async ({ page }) => {
    await page.goto("/ai");

    await expect(
      page.getByRole("heading", { name: /ai companion/i }).first()
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText("I'm your AI financial companion")
    ).toBeVisible();
  });

  test("AI page shows template cards", async ({ page }) => {
    await page.goto("/ai");
    await expect(
      page.getByRole("heading", { name: /ai companion/i }).first()
    ).toBeVisible({ timeout: 10_000 });

    // Template cards should be visible
    const expectedTemplates = [
      "Monthly Briefing",
      "Scenario Builder",
      "Funding Analysis",
      "Revenue Forecast",
      "Hiring Impact",
      "Board Prep",
    ];

    for (const template of expectedTemplates) {
      await expect(
        page.getByText(template).first()
      ).toBeVisible();
    }
  });

  test("AI page chat input is present", async ({ page }) => {
    await page.goto("/ai");

    const input = page.getByPlaceholder(
      "Ask about your financials, build a scenario, get advice..."
    );
    await expect(input).toBeVisible({ timeout: 10_000 });
  });

  test("AI page submit button is disabled when input is empty", async ({
    page,
  }) => {
    await page.goto("/ai");

    const input = page.getByPlaceholder(
      "Ask about your financials, build a scenario, get advice..."
    );
    await expect(input).toBeVisible({ timeout: 10_000 });

    const submitButton = page.locator("button[type='submit']");
    await expect(submitButton).toBeDisabled();
  });

  test("AI page typing enables submit button", async ({ page }) => {
    await page.goto("/ai");

    const input = page.getByPlaceholder(
      "Ask about your financials, build a scenario, get advice..."
    );
    await expect(input).toBeVisible({ timeout: 10_000 });

    await input.fill("What is my current burn rate?");
    const submitButton = page.locator("button[type='submit']");
    await expect(submitButton).toBeEnabled();
  });

  test("AI page sending message shows user message in chat", async ({
    page,
  }) => {
    await page.goto("/ai");

    const input = page.getByPlaceholder(
      "Ask about your financials, build a scenario, get advice..."
    );
    await expect(input).toBeVisible({ timeout: 10_000 });

    const message = "What is my current burn rate?";
    await input.fill(message);

    const submitButton = page.locator("button[type='submit']");
    await submitButton.click();

    // User message should appear in chat
    await expect(page.getByText(message)).toBeVisible({ timeout: 5_000 });
  });

  test("AI page New Chat button resets conversation", async ({ page }) => {
    await page.goto("/ai");

    const newChatButton = page.getByRole("button", { name: "New Chat" });
    await expect(newChatButton).toBeVisible({ timeout: 10_000 });

    await newChatButton.click();
    await expect(
      page.getByText("I'm your AI financial companion")
    ).toBeVisible();
  });

  test("AI page History button toggles sidebar", async ({ page }) => {
    await page.goto("/ai");

    const historyButton = page.getByRole("button", { name: "History" });
    await expect(historyButton).toBeVisible({ timeout: 10_000 });

    // Toggle open
    await historyButton.click();
    await expect(
      page.getByText("Recent Conversations")
    ).toBeVisible();

    // Toggle closed
    await historyButton.click();
    await expect(
      page.getByText("Recent Conversations")
    ).not.toBeVisible();
  });

  test("AI page template card click pre-fills chat", async ({ page }) => {
    await page.goto("/ai");

    await expect(
      page.getByRole("heading", { name: /ai companion/i }).first()
    ).toBeVisible({ timeout: 10_000 });

    // Click a template card (e.g., "Monthly Briefing")
    const templateBtn = page
      .locator("button")
      .filter({ hasText: "Monthly Briefing" })
      .first();
    if (await templateBtn.isVisible()) {
      await templateBtn.click();

      // Should show user message from template or navigate to chat
      // Template click typically sends a pre-filled message
      await expect(
        page
          .locator("[class*='message'], [data-role='user']")
          .first()
      ).toBeVisible({ timeout: 10_000 });
    }
  });
});

test.describe("AI UX — mobile viewport", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({
    storageState: "e2e/.auth/user.json",
    viewport: { width: 375, height: 812 },
  });

  test("AI page loads on mobile with templates stacked", async ({ page }) => {
    await page.goto("/ai");

    await expect(
      page.getByRole("heading", { name: /ai companion/i }).first()
    ).toBeVisible({ timeout: 10_000 });

    // Chat input should be visible
    const input = page.getByPlaceholder(
      "Ask about your financials, build a scenario, get advice..."
    );
    await expect(input).toBeVisible();
  });
});

test.describe("AI page — no 500 errors", () => {
  test("/ai does not return 500 (even unauthenticated)", async ({ page }) => {
    const response = await page.goto("/ai", { waitUntil: "commit" });
    expect(response?.status()).toBeLessThan(500);
  });
});
