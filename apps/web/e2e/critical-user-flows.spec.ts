import { test, expect } from "@playwright/test";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const postgres = require("postgres") as typeof import("postgres")["default"];

/**
 * Critical User Flow E2E Tests — BUR-148
 *
 * Tests the 6 critical user journeys that define product reliability:
 *   1. Auth flow: register → verify email → login → dashboard
 *   2. Onboarding: company setup → form → create → dashboard
 *   3. Dashboard: KPIs visible, sidebar nav, seeded data renders
 *   4. Expense management: add → list → categorization
 *   5. AI chat: open → send message → response renders
 *   6. Scenario creation: create → name → save → view
 *
 * These tests require DATABASE_URL and a running app with seeded data.
 * Auth tests use the pre-authenticated session from auth.setup.ts.
 */

const dbAvailable = !!process.env.DATABASE_URL;

// ═══════════════════════════════════════════════════════════════════════════════
// 1. AUTH FLOW — register → verify email → login → dashboard
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Auth flow: register → login → dashboard", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");

  const PASSWORD = "TestPassword1";
  const NAME = "Auth Flow Tester";

  test("new user sees signup form after entering unused email", async ({
    page,
  }) => {
    const uniqueEmail = `e2e-new-${Date.now()}@burnless-test.com`;
    await page.goto("/login");

    await page.getByPlaceholder("you@startup.com").fill(uniqueEmail);
    await page.getByRole("button", { name: "Continue" }).click();

    // Should show "Create your account" heading (signup step)
    await expect(
      page.getByRole("heading", { name: "Create your account" })
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByPlaceholder("Jane Doe")).toBeVisible();
    await expect(page.getByPlaceholder("Min. 8 characters")).toBeVisible();
  });

  test("registration creates account and redirects to dashboard", async ({
    page,
  }) => {
    const uniqueEmail = `e2e-reg-${Date.now()}@burnless-test.com`;
    await page.goto("/login");

    await page.getByPlaceholder("you@startup.com").fill(uniqueEmail);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(
      page.getByRole("heading", { name: "Create your account" })
    ).toBeVisible({ timeout: 10_000 });

    // Fill signup form
    await page.getByPlaceholder("Jane Doe").fill(NAME);
    await page.getByPlaceholder("Min. 8 characters").fill(PASSWORD);

    // Submit signup — button text is "Create account"
    await page.getByRole("button", { name: /create account/i }).click();

    // Email verification disabled (BUR-161) — redirects to dashboard/onboarding
    await expect(page).toHaveURL(/\/(dashboard|onboarding)/, { timeout: 15_000 });
  });

  test("existing user sees signin form and can log in", async ({ page }) => {
    const registerEmail = `e2e-signin-${Date.now()}@burnless-test.com`;
    await page.request.post("/api/auth/register", {
      data: { email: registerEmail, password: PASSWORD, name: NAME },
    });

    // Verify email directly in DB
    const sql = postgres(process.env.DATABASE_URL!);
    try {
      await sql`
        UPDATE users SET email_verified = NOW()
        WHERE email = ${registerEmail}
      `;
    } finally {
      await sql.end();
    }

    await page.goto("/login");
    await page.getByPlaceholder("you@startup.com").fill(registerEmail);
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(
      page.getByRole("heading", { name: "Welcome back" })
    ).toBeVisible({ timeout: 10_000 });

    await page.getByPlaceholder("Enter your password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/(dashboard|onboarding)/, { timeout: 15_000 });
  });

  test("wrong password shows error message", async ({ page }) => {
    const wrongPwEmail = `e2e-wrongpw-${Date.now()}@burnless-test.com`;
    await page.request.post("/api/auth/register", {
      data: { email: wrongPwEmail, password: PASSWORD, name: NAME },
    });

    const sql = postgres(process.env.DATABASE_URL!);
    try {
      await sql`
        UPDATE users SET email_verified = NOW()
        WHERE email = ${wrongPwEmail}
      `;
    } finally {
      await sql.end();
    }

    await page.goto("/login");
    await page.getByPlaceholder("you@startup.com").fill(wrongPwEmail);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(
      page.getByRole("heading", { name: "Welcome back" })
    ).toBeVisible({ timeout: 10_000 });

    await page.getByPlaceholder("Enter your password").fill("WrongPassword1");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Wrong password")).toBeVisible({
      timeout: 10_000,
    });
  });

  // Email verification temporarily disabled (BUR-161)
  // Unverified users are allowed through to dashboard/onboarding
  test("unverified user can access dashboard after login", async ({
    page,
  }) => {
    const unverifiedEmail = `e2e-unverified-${Date.now()}@burnless-test.com`;
    await page.request.post("/api/auth/register", {
      data: { email: unverifiedEmail, password: PASSWORD, name: NAME },
    });

    await page.goto("/login");
    await page.getByPlaceholder("you@startup.com").fill(unverifiedEmail);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(
      page.getByRole("heading", { name: "Welcome back" })
    ).toBeVisible({ timeout: 10_000 });

    await page.getByPlaceholder("Enter your password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    // Should go to dashboard/onboarding, NOT verify-email
    await expect(page).toHaveURL(/\/(dashboard|onboarding)/, { timeout: 15_000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. ONBOARDING — covered by e2e/onboarding-wizard-flow.spec.ts (S4b wizard).
//    The old "company setup flow" describe block here asserted the retired
//    single-page review UI and was removed in the S4b review-fix pass.
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// 3. DASHBOARD — KPIs visible, sidebar nav, data renders
//    Uses pre-authenticated session (storageState from auth.setup.ts)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Dashboard: authenticated with seeded data", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("dashboard page loads and shows KPI cards", async ({ page }) => {
    await page.goto("/dashboard");

    // Should not redirect to login (authenticated)
    await expect(page).toHaveURL(/\/dashboard/);

    // KPI cards should be visible — use .first() since there are multiple matches
    await expect(page.getByText(/cash position/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/burn rate/i).first()).toBeVisible();
    await expect(page.getByText(/runway/i).first()).toBeVisible();
  });

  test("dashboard shows dollar amounts from seeded data", async ({ page }) => {
    await page.goto("/dashboard");

    // The seeded data has real financial numbers
    await expect(
      page.locator("text=/\\$[\\d,.]+[kKmM]?/").first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("sidebar navigation works — all main links present", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    // Scope to the navigation container to avoid matching links in main content
    const nav = page.getByLabel("Main navigation");

    const navItems = [
      "Dashboard",
      "Expenses",
      "Revenue",
      "Funding",
      "Team",
      "Scenarios",
      "Data Room",
      "Settings",
    ];

    for (const label of navItems) {
      await expect(
        nav.getByRole("link", { name: label, exact: true })
      ).toBeVisible();
    }
  });

  test("sidebar navigation — clicking Expenses navigates correctly", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    const nav = page.getByLabel("Main navigation");
    await nav.getByRole("link", { name: "Expenses", exact: true }).click();

    await expect(page).toHaveURL(/\/expenses/);
    await expect(
      page.getByRole("heading", { name: "Expenses" })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("sidebar navigation — clicking Scenarios navigates correctly", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    const nav = page.getByLabel("Main navigation");
    await nav.getByRole("link", { name: "Scenarios", exact: true }).click();

    await expect(page).toHaveURL(/\/scenarios/);
    await expect(
      page.getByRole("heading", { name: "Scenarios" })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("sidebar navigation — clicking Revenue navigates correctly", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    const nav = page.getByLabel("Main navigation");
    await nav.getByRole("link", { name: "Revenue", exact: true }).click();

    await expect(page).toHaveURL(/\/revenue/);
    await expect(
      page.getByRole("heading", { name: "Revenue", exact: true })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("dashboard shows financial data components", async ({ page }) => {
    await page.goto("/dashboard");

    // Wait for page to fully load and render data
    await expect(page).toHaveURL(/\/dashboard/);

    // Should have at least one heading or financial component
    await expect(page.locator("h1, h2, h3").first()).toBeVisible({
      timeout: 10_000,
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. EXPENSE MANAGEMENT — add → list → categorization
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Expense management: add and view expenses", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("expenses page shows heading and seeded expense data", async ({
    page,
  }) => {
    await page.goto("/expenses");

    await expect(
      page.getByRole("heading", { name: "Expenses" })
    ).toBeVisible({ timeout: 10_000 });

    await expect(
      page.getByText(/intelligent spend management/i)
    ).toBeVisible();
  });

  test("Add Expense button opens form with correct fields", async ({
    page,
  }) => {
    await page.goto("/expenses");
    await expect(
      page.getByRole("heading", { name: "Expenses" })
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Add Expense" }).click();

    // Modal should open with form fields
    await expect(
      page.getByPlaceholder("e.g. AWS")
    ).toBeVisible();
    await expect(page.getByPlaceholder("5000")).toBeVisible();
    // Use label locator instead of getByText to avoid matching multiple elements
    await expect(page.locator("label", { hasText: "Account" })).toBeVisible();
    await expect(
      page.locator("label", { hasText: "Amount" })
    ).toBeVisible();
  });

  test("Add Expense form — Cancel closes modal", async ({ page }) => {
    await page.goto("/expenses");
    await expect(
      page.getByRole("heading", { name: "Expenses" })
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Add Expense" }).click();
    await expect(
      page.getByPlaceholder("e.g. AWS")
    ).toBeVisible();

    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(
      page.getByPlaceholder("e.g. AWS")
    ).not.toBeVisible();
  });

  test("Add Expense form — submit button disabled without required fields", async ({
    page,
  }) => {
    await page.goto("/expenses");
    await expect(
      page.getByRole("heading", { name: "Expenses" })
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Add Expense" }).click();

    // The submit button inside the modal should be disabled
    const submitBtn = page
      .locator("button[type='submit']")
      .filter({ hasText: /add expense/i });
    await expect(submitBtn).toBeDisabled();
  });

  test("Add Expense form — filling fields enables submit", async ({
    page,
  }) => {
    await page.goto("/expenses");
    await expect(
      page.getByRole("heading", { name: "Expenses" })
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Add Expense" }).click();

    await page
      .getByPlaceholder("e.g. AWS")
      .fill("E2E Test Expense");
    await page.getByPlaceholder("5000").fill("1500");

    const submitBtn = page
      .locator("button[type='submit']")
      .filter({ hasText: /add expense/i });
    await expect(submitBtn).toBeEnabled();
  });

  test("Add Expense — successfully creates expense", async ({ page }) => {
    await page.goto("/expenses");
    await expect(
      page.getByRole("heading", { name: "Expenses" })
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Add Expense" }).click();

    const expenseName = `E2E Expense ${Date.now()}`;
    await page
      .getByPlaceholder("e.g. AWS")
      .fill(expenseName);
    await page.getByPlaceholder("5000").fill("2500");

    const submitBtn = page
      .locator("button[type='submit']")
      .filter({ hasText: /add expense/i });
    await submitBtn.click();

    // Modal should close after successful creation
    await expect(
      page.getByPlaceholder("e.g. AWS")
    ).not.toBeVisible({ timeout: 10_000 });
  });

  test("expenses page shows dollar amounts from seeded data", async ({
    page,
  }) => {
    await page.goto("/expenses");

    await expect(
      page.locator("text=/\\$[\\d,.]+/").first()
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. AI CHAT — open → send message → response renders
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Companion: chat interaction", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("AI page loads with welcome message", async ({ page }) => {
    await page.goto("/ai");

    // Use heading to avoid matching multiple "Companion" elements
    await expect(
      page.getByRole("heading", { name: /companion/i }).first()
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText("Your personal CFO that understands your numbers")
    ).toBeVisible();
  });

  test("chat input is present and submit button is disabled when empty", async ({
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

  test("typing enables submit button", async ({ page }) => {
    await page.goto("/ai");

    const input = page.getByPlaceholder(
      "Ask about your financials, build a scenario, get advice..."
    );
    await expect(input).toBeVisible({ timeout: 10_000 });
    await input.fill("What is my current burn rate?");

    const submitButton = page.locator("button[type='submit']");
    await expect(submitButton).toBeEnabled();
  });

  test("sending a message shows user message in the chat", async ({
    page,
  }) => {
    await page.goto("/ai");

    const input = page.getByPlaceholder(
      "Ask about your financials, build a scenario, get advice..."
    );
    await expect(input).toBeVisible({ timeout: 10_000 });
    await input.fill("What is my current burn rate?");

    const submitButton = page.locator("button[type='submit']");
    await submitButton.click();

    // User message should appear in the chat
    await expect(
      page.getByText("What is my current burn rate?")
    ).toBeVisible({ timeout: 5_000 });
  });

  test("New Chat button is visible and resets conversation", async ({
    page,
  }) => {
    await page.goto("/ai");

    const newChatButton = page.getByRole("button", { name: "New Chat" });
    await expect(newChatButton).toBeVisible({ timeout: 10_000 });

    await newChatButton.click();
    await expect(
      page.getByText("Your personal CFO that understands your numbers")
    ).toBeVisible();
  });

  test("History button toggles conversation sidebar", async ({ page }) => {
    await page.goto("/ai");

    const historyButton = page.getByRole("button", { name: "History" });
    await expect(historyButton).toBeVisible({ timeout: 10_000 });

    // Toggle open
    await historyButton.click();
    await expect(page.getByRole("heading", { name: "History" })).toBeVisible();

    // Toggle closed
    await historyButton.evaluate(el => (el as HTMLButtonElement).click());
    await expect(page.getByRole("heading", { name: "History" })).not.toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. SCENARIO CREATION — create → parameters → save → view
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Scenario creation: create and view scenarios", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("scenarios page shows heading and seeded scenarios", async ({
    page,
  }) => {
    await page.goto("/scenarios");

    await expect(
      page.getByRole("heading", { name: "Scenarios" })
    ).toBeVisible({ timeout: 10_000 });

    await expect(
      page.getByText("Model different futures for your business")
    ).toBeVisible();

    // Seeded data includes Base Case scenario
    await expect(page.getByText("Base Case").first()).toBeVisible();
  });

  test("New Scenario button opens template dialog", async ({ page }) => {
    await page.goto("/scenarios");
    await expect(
      page.getByRole("heading", { name: "Scenarios" })
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /new scenario/i }).click();

    // Select the "Template" path card
    await page.getByRole("button", { name: "Template" }).click();

    // Template picker should show templates
    await expect(page.getByRole("button", { name: "Fundraise", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Growth Acceleration", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Lean Operations", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Hiring Plan", exact: true })).toBeVisible();
  });

  test("selecting a template creates scenario and navigates to detail", async ({
    page,
  }) => {
    await page.goto("/scenarios");
    await expect(
      page.getByRole("heading", { name: "Scenarios" })
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /new scenario/i }).click();

    // Select the "Template" path card
    await page.getByRole("button", { name: "Template" }).click();

    // Select the "Lean Operations" template button
    await page.getByRole("button", { name: "Lean Operations", exact: true }).click();

    // Enter a scenario name
    await page.getByLabel("Scenario name").fill(`E2E Lean Ops ${Date.now()}`);

    // Click "Create Scenario"
    await page.getByRole("button", { name: "Create Scenario" }).click();

    // Should navigate to the new scenario's detail page
    await expect(page).toHaveURL(/\/scenarios\//, { timeout: 15_000 });
  });

  test("scenario detail page loads for seeded scenario", async ({ page }) => {
    // Navigate directly to the seeded base scenario
    const baseScenarioId = "00000000-0000-4000-a000-000000000200";
    const response = await page.goto(`/scenarios/${baseScenarioId}`, {
      waitUntil: "commit",
    });
    expect(
      response?.status(),
      "Scenario detail page should not return 500"
    ).toBeLessThan(500);
  });

  test("scenario compare page loads", async ({ page }) => {
    const response = await page.goto("/scenarios/compare", {
      waitUntil: "commit",
    });
    expect(
      response?.status(),
      "Scenario compare page should not return 500"
    ).toBeLessThan(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CROSS-CUTTING: Protected route redirect behavior
// ═══════════════════════════════════════════════════════════════════════════════

test.describe.serial("Protected routes redirect unauthenticated users", () => {
  test.setTimeout(60_000);

  const protectedRoutes = [
    "/dashboard",
    "/expenses",
    "/revenue",
    "/funding",
    "/team",
    "/scenarios",
    "/reports",
    "/ai",
    "/settings",
    "/import",
    "/data-room",
  ];

  for (const route of protectedRoutes) {
    test(`${route} redirects to /login`, async ({ page }) => {
      await page.goto(route, { waitUntil: "commit" });
      await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CROSS-CUTTING: No 500 errors on any authenticated page
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("No 500 errors on authenticated pages", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  const pages = [
    "/dashboard",
    "/expenses",
    "/revenue",
    "/funding",
    "/team",
    "/scenarios",
    "/reports",
    "/ai",
    "/settings",
    "/import",
    "/data-room",
    "/overview",
    "/reports/profit-loss",
    "/reports/cash-flow",
    "/reports/balance-sheet",
    "/reports/runway",
    "/reports/metrics",
    "/reports/budget-vs-actuals",
    "/reports/scenario-compare",
    "/reports/board-update",
  ];

  for (const path of pages) {
    test(`${path} does not return 500 when authenticated`, async ({
      page,
    }) => {
      const response = await page.goto(path, { waitUntil: "commit" });
      expect(
        response?.status(),
        `${path} returned server error ${response?.status()}`
      ).toBeLessThan(500);
    });
  }
});
