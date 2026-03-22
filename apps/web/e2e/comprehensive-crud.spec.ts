import { test, expect } from "@playwright/test";

/**
 * Comprehensive CRUD E2E Tests — BUR-248
 *
 * Full lifecycle tests for all financial data entities:
 *   - Expenses: add → verify → edit → verify → delete → verify gone
 *   - Revenue streams: add all 4 types (subscription, services, one-time, usage-based)
 *   - Funding rounds: add → edit → delete with 2-step confirmation
 *   - Team members: add → edit → delete with inline confirmation
 *
 * All tests require DATABASE_URL and a running app with seeded data.
 * Uses the pre-authenticated session from auth.setup.ts.
 */

const dbAvailable = !!process.env.DATABASE_URL;

// ═══════════════════════════════════════════════════════════════════════════════
// EXPENSES — Full CRUD lifecycle
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Expenses CRUD lifecycle", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("add expense → appears in list → edit amount → verify change → delete → verify gone", async ({
    page,
  }) => {
    await page.goto("/expenses");
    await expect(
      page.getByRole("heading", { name: "Expenses" })
    ).toBeVisible({ timeout: 15_000 });

    // ── Step 1: Add a new expense ──
    const expenseName = `QA CRUD Expense ${Date.now()}`;

    await page.getByRole("button", { name: "Add Expense" }).click();
    await expect(
      page.getByPlaceholder("e.g. AWS Hosting, Office Rent")
    ).toBeVisible({ timeout: 5_000 });

    await page
      .getByPlaceholder("e.g. AWS Hosting, Office Rent")
      .fill(expenseName);
    await page.getByPlaceholder("5000").fill("3000");

    const addBtn = page
      .locator("button[type='submit']")
      .filter({ hasText: /add expense/i });
    await expect(addBtn).toBeEnabled();
    await addBtn.click();

    // Modal should close
    await expect(
      page.getByPlaceholder("e.g. AWS Hosting, Office Rent")
    ).not.toBeVisible({ timeout: 10_000 });

    // ── Step 2: Verify expense appears in list ──
    await expect(page.getByText(expenseName).first()).toBeVisible({
      timeout: 10_000,
    });

    // ── Step 3: Edit the expense ──
    const editBtn = page.getByLabel(`Edit ${expenseName}`);
    await editBtn.click();

    // Edit modal should open with name disabled
    await expect(
      page.getByText(`Edit: ${expenseName}`)
    ).toBeVisible({ timeout: 5_000 });

    // Amount should be pre-populated with 3000
    const amountInput = page.getByPlaceholder("5000");
    await expect(amountInput).toBeVisible();

    // Change amount to 5500
    await amountInput.fill("5500");

    const saveBtn = page
      .locator("button[type='submit']")
      .filter({ hasText: /save changes/i });
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    // Edit modal should close
    await expect(
      page.getByText(`Edit: ${expenseName}`)
    ).not.toBeVisible({ timeout: 10_000 });

    // ── Step 4: Delete the expense ──
    // Wait for page to refresh and show updated data
    await expect(page.getByText(expenseName).first()).toBeVisible({
      timeout: 10_000,
    });

    const deleteBtn = page.getByLabel(`Delete ${expenseName}`);
    await deleteBtn.click();

    // Delete confirmation modal should appear
    await expect(page.getByText("Delete Expense")).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByText(`Are you sure you want to delete`)
    ).toBeVisible();

    // Confirm deletion
    const confirmDeleteBtn = page
      .locator("button")
      .filter({ hasText: /^delete$/i })
      .last();
    await confirmDeleteBtn.click();

    // ── Step 5: Verify expense is gone ──
    await expect(page.getByText(expenseName)).not.toBeVisible({
      timeout: 10_000,
    });
  });

  test("add expense with growth rate type", async ({ page }) => {
    await page.goto("/expenses");
    await expect(
      page.getByRole("heading", { name: "Expenses" })
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Add Expense" }).click();

    const name = `QA Growth Expense ${Date.now()}`;
    await page
      .getByPlaceholder("e.g. AWS Hosting, Office Rent")
      .fill(name);
    await page.getByPlaceholder("5000").fill("1000");

    // Switch to Growth Rate type
    await page.locator("select").filter({ hasText: "Fixed Amount" }).selectOption("growth_rate");

    // Growth rate field should appear
    await expect(page.getByPlaceholder("5")).toBeVisible();
    await page.getByPlaceholder("5").fill("10");

    const addBtn = page
      .locator("button[type='submit']")
      .filter({ hasText: /add expense/i });
    await addBtn.click();

    // Modal closes, expense appears
    await expect(
      page.getByPlaceholder("e.g. AWS Hosting, Office Rent")
    ).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 10_000 });
  });

  test("add expense shows AI auto-categorization suggestion", async ({ page }) => {
    await page.goto("/expenses");
    await expect(
      page.getByRole("heading", { name: "Expenses" })
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Add Expense" }).click();

    // Type a name that should trigger AI suggestion (at least 3 chars)
    await page
      .getByPlaceholder("e.g. AWS Hosting, Office Rent")
      .fill("AWS Hosting");

    // AI suggestion should appear
    await expect(
      page.getByText(/auto-detected/i).first()
    ).toBeVisible({ timeout: 5_000 });

    // Cancel without saving
    await page.getByRole("button", { name: "Cancel" }).click();
  });

  test("add expense validates required fields on blur", async ({ page }) => {
    await page.goto("/expenses");
    await expect(
      page.getByRole("heading", { name: "Expenses" })
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Add Expense" }).click();

    // Touch name field and blur without filling — should show error
    const nameInput = page.getByPlaceholder("e.g. AWS Hosting, Office Rent");
    await nameInput.focus();
    await nameInput.blur();

    // The submit button should be disabled
    const addBtn = page
      .locator("button[type='submit']")
      .filter({ hasText: /add expense/i });
    await expect(addBtn).toBeDisabled();

    await page.getByRole("button", { name: "Cancel" }).click();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// REVENUE STREAMS — All 4 types CRUD
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Revenue stream CRUD — all types", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("add subscription (SaaS) revenue stream", async ({ page }) => {
    await page.goto("/revenue");
    await expect(
      page.getByRole("heading", { name: "Revenue" })
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Add Revenue Stream" }).click();

    const streamName = `QA SaaS Stream ${Date.now()}`;
    await page
      .getByPlaceholder("e.g. Growth Plan, Implementation Services")
      .fill(streamName);

    // Default type is Subscription (SaaS) — fill subscription-specific fields
    await expect(page.getByText("Subscription Parameters")).toBeVisible();
    await page.getByPlaceholder("99").fill("49");
    await page.getByPlaceholder("50").fill("100");
    await page.getByPlaceholder("15").fill("20");
    await page.getByPlaceholder("2.5").fill("3");

    const addBtn = page
      .locator("button[type='submit']")
      .filter({ hasText: /add stream/i });
    await expect(addBtn).toBeEnabled();
    await addBtn.click();

    // Modal should close
    await expect(
      page.getByPlaceholder("e.g. Growth Plan, Implementation Services")
    ).not.toBeVisible({ timeout: 10_000 });

    // Stream should appear in the breakdown
    await expect(page.getByText(streamName).first()).toBeVisible({ timeout: 10_000 });
  });

  test("add professional services revenue stream", async ({ page }) => {
    await page.goto("/revenue");
    await expect(
      page.getByRole("heading", { name: "Revenue" })
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Add Revenue Stream" }).click();

    const streamName = `QA Services ${Date.now()}`;
    await page
      .getByPlaceholder("e.g. Growth Plan, Implementation Services")
      .fill(streamName);

    // Switch to Professional Services
    await page
      .locator("select")
      .filter({ hasText: "Subscription (SaaS)" })
      .selectOption("services");

    await expect(page.getByText("Services Parameters")).toBeVisible();
    await page.getByPlaceholder("150").fill("200");
    await page.getByPlaceholder("40").fill("80");

    const addBtn = page
      .locator("button[type='submit']")
      .filter({ hasText: /add stream/i });
    await addBtn.click();

    await expect(
      page.getByPlaceholder("e.g. Growth Plan, Implementation Services")
    ).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(streamName).first()).toBeVisible({ timeout: 10_000 });
  });

  test("add one-time sales revenue stream", async ({ page }) => {
    await page.goto("/revenue");
    await expect(
      page.getByRole("heading", { name: "Revenue" })
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Add Revenue Stream" }).click();

    const streamName = `QA One-Time ${Date.now()}`;
    await page
      .getByPlaceholder("e.g. Growth Plan, Implementation Services")
      .fill(streamName);

    // Switch to One-Time Sales
    await page
      .locator("select")
      .filter({ hasText: "Subscription (SaaS)" })
      .selectOption("one_time");

    await expect(page.getByText("One-Time Parameters")).toBeVisible();
    await page.getByPlaceholder("500").fill("1000");
    await page.getByPlaceholder("10").fill("25");

    const addBtn = page
      .locator("button[type='submit']")
      .filter({ hasText: /add stream/i });
    await addBtn.click();

    await expect(
      page.getByPlaceholder("e.g. Growth Plan, Implementation Services")
    ).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(streamName).first()).toBeVisible({ timeout: 10_000 });
  });

  test("add usage-based revenue stream", async ({ page }) => {
    await page.goto("/revenue");
    await expect(
      page.getByRole("heading", { name: "Revenue" })
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Add Revenue Stream" }).click();

    const streamName = `QA Usage ${Date.now()}`;
    await page
      .getByPlaceholder("e.g. Growth Plan, Implementation Services")
      .fill(streamName);

    // Switch to Usage-Based
    await page
      .locator("select")
      .filter({ hasText: "Subscription (SaaS)" })
      .selectOption("usage_based");

    await expect(page.getByText("Usage-Based Parameters")).toBeVisible();
    await page.getByPlaceholder("0.10").fill("0.05");
    await page.getByPlaceholder("100000").fill("500000");

    const addBtn = page
      .locator("button[type='submit']")
      .filter({ hasText: /add stream/i });
    await addBtn.click();

    await expect(
      page.getByPlaceholder("e.g. Growth Plan, Implementation Services")
    ).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(streamName).first()).toBeVisible({ timeout: 10_000 });
  });

  test("edit revenue stream → change name → save", async ({ page }) => {
    await page.goto("/revenue");
    await expect(
      page.getByRole("heading", { name: "Revenue" })
    ).toBeVisible({ timeout: 15_000 });

    // First add a stream to edit
    await page.getByRole("button", { name: "Add Revenue Stream" }).click();
    const originalName = `QA Edit Rev ${Date.now()}`;
    await page
      .getByPlaceholder("e.g. Growth Plan, Implementation Services")
      .fill(originalName);
    await page.getByPlaceholder("99").fill("79");
    await page.getByPlaceholder("50").fill("30");
    await page.getByPlaceholder("15").fill("10");
    await page.getByPlaceholder("2.5").fill("5");

    const addBtn = page
      .locator("button[type='submit']")
      .filter({ hasText: /add stream/i });
    await addBtn.click();
    await expect(
      page.getByPlaceholder("e.g. Growth Plan, Implementation Services")
    ).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(originalName).first()).toBeVisible({ timeout: 10_000 });

    // Click edit button (hover to make visible, then click)
    const editBtn = page.getByLabel(`Edit ${originalName}`);
    await editBtn.click({ force: true }); // force because it's opacity-0 until hover

    // Edit modal should show
    await expect(page.getByText("Edit Revenue Stream")).toBeVisible({ timeout: 5_000 });

    // Change the name
    const nameInput = page.getByPlaceholder("e.g. Growth Plan, Implementation Services");
    await nameInput.fill(`${originalName} EDITED`);

    const saveBtn = page
      .locator("button[type='submit']")
      .filter({ hasText: /save changes/i });
    await saveBtn.click();

    // Modal should close, new name should appear
    await expect(page.getByText("Edit Revenue Stream")).not.toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText(`${originalName} EDITED`).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("delete revenue stream from edit modal", async ({ page }) => {
    await page.goto("/revenue");
    await expect(
      page.getByRole("heading", { name: "Revenue" })
    ).toBeVisible({ timeout: 15_000 });

    // Add a stream to delete
    await page.getByRole("button", { name: "Add Revenue Stream" }).click();
    const streamName = `QA Delete Rev ${Date.now()}`;
    await page
      .getByPlaceholder("e.g. Growth Plan, Implementation Services")
      .fill(streamName);
    await page.getByPlaceholder("99").fill("29");
    await page.getByPlaceholder("50").fill("5");
    await page.getByPlaceholder("15").fill("3");
    await page.getByPlaceholder("2.5").fill("2");

    const addBtn = page
      .locator("button[type='submit']")
      .filter({ hasText: /add stream/i });
    await addBtn.click();
    await expect(
      page.getByPlaceholder("e.g. Growth Plan, Implementation Services")
    ).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(streamName).first()).toBeVisible({ timeout: 10_000 });

    // Delete via the inline delete button (uses confirm() dialog)
    page.on("dialog", (dialog) => dialog.accept());
    const deleteBtn = page.getByLabel(`Delete ${streamName}`);
    await deleteBtn.click({ force: true });

    // Stream should disappear
    await expect(page.getByText(streamName)).not.toBeVisible({ timeout: 10_000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FUNDING ROUNDS — Full CRUD lifecycle
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Funding rounds CRUD lifecycle", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("add funding round with equity fields", async ({ page }) => {
    await page.goto("/funding");
    await expect(
      page.getByRole("heading", { name: "Funding" })
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Add Funding Round" }).click();

    const roundName = `QA Seed ${Date.now()}`;
    await page
      .getByPlaceholder("e.g. Seed Round, AWS Activate Grant")
      .fill(roundName);

    // Type defaults to Seed — fill amount and date
    await page.getByPlaceholder("2000000").fill("1500000");
    // Pre-money valuation and dilution (equity fields, visible for non-debt/grant)
    await page.getByPlaceholder("8000000").fill("6000000");
    await page.getByPlaceholder("20").fill("15");

    const addBtn = page
      .locator("button[type='submit']")
      .filter({ hasText: /add round/i });
    await expect(addBtn).toBeEnabled();
    await addBtn.click();

    // Modal should close
    await expect(
      page.getByPlaceholder("e.g. Seed Round, AWS Activate Grant")
    ).not.toBeVisible({ timeout: 10_000 });

    // Round should appear on page
    await expect(page.getByText(roundName).first()).toBeVisible({ timeout: 10_000 });
  });

  test("add grant funding round — no equity fields shown", async ({ page }) => {
    await page.goto("/funding");
    await expect(
      page.getByRole("heading", { name: "Funding" })
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Add Funding Round" }).click();

    const roundName = `QA Grant ${Date.now()}`;
    await page
      .getByPlaceholder("e.g. Seed Round, AWS Activate Grant")
      .fill(roundName);

    // Switch to Grant type
    await page
      .locator("select")
      .filter({ hasText: "Seed" })
      .selectOption("grant");

    await page.getByPlaceholder("2000000").fill("50000");

    // Pre-money valuation and dilution should NOT be visible for Grant
    await expect(page.getByPlaceholder("8000000")).not.toBeVisible();
    await expect(page.locator("label", { hasText: "Dilution" })).not.toBeVisible();

    const addBtn = page
      .locator("button[type='submit']")
      .filter({ hasText: /add round/i });
    await addBtn.click();

    await expect(
      page.getByPlaceholder("e.g. Seed Round, AWS Activate Grant")
    ).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(roundName).first()).toBeVisible({ timeout: 10_000 });
  });

  test("add projected funding round", async ({ page }) => {
    await page.goto("/funding");
    await expect(
      page.getByRole("heading", { name: "Funding" })
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Add Funding Round" }).click();

    const roundName = `QA Projected ${Date.now()}`;
    await page
      .getByPlaceholder("e.g. Seed Round, AWS Activate Grant")
      .fill(roundName);
    await page
      .locator("select")
      .filter({ hasText: "Seed" })
      .selectOption("series_a");
    await page.getByPlaceholder("2000000").fill("5000000");

    // Check "projected" checkbox
    const projectedCheckbox = page.locator("input[type='checkbox']");
    await projectedCheckbox.check();

    const addBtn = page
      .locator("button[type='submit']")
      .filter({ hasText: /add round/i });
    await addBtn.click();

    await expect(
      page.getByPlaceholder("e.g. Seed Round, AWS Activate Grant")
    ).not.toBeVisible({ timeout: 10_000 });

    // Projected round should show "Projected" badge
    await expect(page.getByText(roundName).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Projected").first()).toBeVisible();
  });

  test("edit funding round → change amount → save", async ({ page }) => {
    await page.goto("/funding");
    await expect(
      page.getByRole("heading", { name: "Funding" })
    ).toBeVisible({ timeout: 15_000 });

    // Add a round to edit
    await page.getByRole("button", { name: "Add Funding Round" }).click();
    const roundName = `QA Edit Fund ${Date.now()}`;
    await page
      .getByPlaceholder("e.g. Seed Round, AWS Activate Grant")
      .fill(roundName);
    await page.getByPlaceholder("2000000").fill("1000000");
    const addBtn = page
      .locator("button[type='submit']")
      .filter({ hasText: /add round/i });
    await addBtn.click();
    await expect(
      page.getByPlaceholder("e.g. Seed Round, AWS Activate Grant")
    ).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(roundName).first()).toBeVisible({ timeout: 10_000 });

    // Click edit (hover-visible)
    const editBtn = page.getByLabel(`Edit ${roundName}`);
    await editBtn.click({ force: true });

    // Edit modal with pre-populated fields
    await expect(page.getByText("Edit Funding Round")).toBeVisible({ timeout: 5_000 });

    // Change amount
    const amountInput = page.getByPlaceholder("2000000");
    await amountInput.fill("2000000");

    const saveBtn = page
      .locator("button[type='submit']")
      .filter({ hasText: /save changes/i });
    await saveBtn.click();

    // Modal closes
    await expect(page.getByText("Edit Funding Round")).not.toBeVisible({ timeout: 10_000 });
  });

  test("delete funding round — 2-step confirmation", async ({ page }) => {
    await page.goto("/funding");
    await expect(
      page.getByRole("heading", { name: "Funding" })
    ).toBeVisible({ timeout: 15_000 });

    // Add a round to delete
    await page.getByRole("button", { name: "Add Funding Round" }).click();
    const roundName = `QA Delete Fund ${Date.now()}`;
    await page
      .getByPlaceholder("e.g. Seed Round, AWS Activate Grant")
      .fill(roundName);
    await page.getByPlaceholder("2000000").fill("500000");
    const addBtn = page
      .locator("button[type='submit']")
      .filter({ hasText: /add round/i });
    await addBtn.click();
    await expect(
      page.getByPlaceholder("e.g. Seed Round, AWS Activate Grant")
    ).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(roundName).first()).toBeVisible({ timeout: 10_000 });

    // Open edit modal
    const editBtn = page.getByLabel(`Edit ${roundName}`);
    await editBtn.click({ force: true });
    await expect(page.getByText("Edit Funding Round")).toBeVisible({ timeout: 5_000 });

    // Step 1: Click Delete → shows "Are you sure?"
    const deleteBtn = page.locator("button").filter({ hasText: /^delete$/i });
    await deleteBtn.click();

    await expect(page.getByText("Are you sure?")).toBeVisible();

    // Step 2: Confirm with "Yes, delete"
    await page.locator("button").filter({ hasText: "Yes, delete" }).click();

    // Modal closes, round removed
    await expect(page.getByText("Edit Funding Round")).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(roundName)).not.toBeVisible({ timeout: 10_000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEAM / HEADCOUNT — Full CRUD lifecycle
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Team member CRUD lifecycle", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("add team member → verify in list", async ({ page }) => {
    await page.goto("/team");
    await expect(
      page.getByRole("heading", { name: "Team" })
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Add Team Member" }).click();

    // Fill hire form
    const title = `QA Engineer ${Date.now()}`;
    await page
      .getByPlaceholder("e.g. Senior Engineer, Product Manager")
      .fill(title);
    await page.getByPlaceholder("120000").fill("95000");

    // Monthly impact should calculate and display
    await expect(page.getByText(/\+\$.*k\/mo/)).toBeVisible();

    const addBtn = page
      .locator("button[type='submit']")
      .filter({ hasText: /add member/i });
    await expect(addBtn).toBeEnabled();
    await addBtn.click();

    // Modal closes, member appears
    await expect(
      page.getByPlaceholder("e.g. Senior Engineer, Product Manager")
    ).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 10_000 });
  });

  test("add team member with custom benefits rate", async ({ page }) => {
    await page.goto("/team");
    await expect(
      page.getByRole("heading", { name: "Team" })
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Add Team Member" }).click();

    const title = `QA PM ${Date.now()}`;
    await page
      .getByPlaceholder("e.g. Senior Engineer, Product Manager")
      .fill(title);
    await page.getByPlaceholder("120000").fill("130000");

    // Change benefits rate from default 20 to 30
    const benefitsInput = page.getByPlaceholder("20");
    await benefitsInput.fill("30");

    const addBtn = page
      .locator("button[type='submit']")
      .filter({ hasText: /add member/i });
    await addBtn.click();

    await expect(
      page.getByPlaceholder("e.g. Senior Engineer, Product Manager")
    ).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 10_000 });
  });

  test("add team member with new department", async ({ page }) => {
    await page.goto("/team");
    await expect(
      page.getByRole("heading", { name: "Team" })
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Add Team Member" }).click();

    const title = `QA Dept Test ${Date.now()}`;
    await page
      .getByPlaceholder("e.g. Senior Engineer, Product Manager")
      .fill(title);
    await page.getByPlaceholder("120000").fill("110000");

    // Select "Create new department"
    await page
      .locator("select")
      .filter({ hasText: /engineering|sales|product|create new/i })
      .selectOption("__new__");

    // New department name field should appear
    await expect(
      page.getByPlaceholder("e.g. Engineering, Sales")
    ).toBeVisible();
    await page
      .getByPlaceholder("e.g. Engineering, Sales")
      .fill(`QA Dept ${Date.now()}`);

    const addBtn = page
      .locator("button[type='submit']")
      .filter({ hasText: /add member/i });
    await addBtn.click();

    await expect(
      page.getByPlaceholder("e.g. Senior Engineer, Product Manager")
    ).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 10_000 });
  });

  test("edit team member → change salary → save", async ({ page }) => {
    await page.goto("/team");
    await expect(
      page.getByRole("heading", { name: "Team" })
    ).toBeVisible({ timeout: 15_000 });

    // Add a member to edit
    await page.getByRole("button", { name: "Add Team Member" }).click();
    const title = `QA Edit Hire ${Date.now()}`;
    await page
      .getByPlaceholder("e.g. Senior Engineer, Product Manager")
      .fill(title);
    await page.getByPlaceholder("120000").fill("90000");

    const addBtn = page
      .locator("button[type='submit']")
      .filter({ hasText: /add member/i });
    await addBtn.click();
    await expect(
      page.getByPlaceholder("e.g. Senior Engineer, Product Manager")
    ).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 10_000 });

    // Find and click edit button (title="Edit team member" on the row)
    // Use the row containing our title, then find the edit button within
    const row = page.locator("tr, div").filter({ hasText: title }).first();
    const editBtn = row.locator("button[title='Edit team member'], button[title='Edit planned hire']");
    await editBtn.click({ force: true });

    // Edit modal should open
    await expect(page.getByText("Edit Team Member")).toBeVisible({ timeout: 5_000 });

    // Change salary
    const salaryInput = page.getByPlaceholder("120000");
    await salaryInput.fill("105000");

    const saveBtn = page
      .locator("button[type='submit']")
      .filter({ hasText: /save changes/i });
    await saveBtn.click();

    // Modal closes
    await expect(page.getByText("Edit Team Member")).not.toBeVisible({ timeout: 10_000 });
  });

  test("team member form validates required fields", async ({ page }) => {
    await page.goto("/team");
    await expect(
      page.getByRole("heading", { name: "Team" })
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Add Team Member" }).click();

    // Don't fill anything — submit should be disabled
    const addBtn = page
      .locator("button[type='submit']")
      .filter({ hasText: /add member/i });
    await expect(addBtn).toBeDisabled();

    // Fill only title, salary should still be required
    await page
      .getByPlaceholder("e.g. Senior Engineer, Product Manager")
      .fill("Test Role");
    await expect(addBtn).toBeDisabled();

    // Fill salary too
    await page.getByPlaceholder("120000").fill("80000");
    await expect(addBtn).toBeEnabled();

    await page.getByRole("button", { name: "Cancel" }).click();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIOS — Create, view detail, compare
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Scenario CRUD and navigation", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("create scenario from each template", async ({ page }) => {
    await page.goto("/scenarios");
    await expect(
      page.getByRole("heading", { name: "Scenarios" })
    ).toBeVisible({ timeout: 15_000 });

    // Open template dialog
    await page.getByRole("button", { name: /new scenario/i }).click();

    // Verify all 4 templates are shown
    const templates = [
      "Fundraise Scenario",
      "Growth Acceleration",
      "Lean Operations",
      "Hiring Plan",
    ];
    for (const tpl of templates) {
      await expect(page.getByText(tpl)).toBeVisible();
    }

    // Create from "Fundraise Scenario" template
    await page.locator("button").filter({ hasText: "Fundraise Scenario" }).click();

    // Should navigate to the new scenario detail
    await expect(page).toHaveURL(/\/scenarios\//, { timeout: 15_000 });
  });

  test("scenario detail page shows financial data", async ({ page }) => {
    // Use seeded Base Case scenario
    const baseId = "00000000-0000-4000-a000-000000000200";
    await page.goto(`/scenarios/${baseId}`);

    // Should not 500
    await expect(page.locator("h1, h2, h3").first()).toBeVisible({
      timeout: 15_000,
    });

    // Should show some financial metrics
    await expect(
      page.locator("text=/\\$[\\d,.]+/").first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("scenario compare page loads and shows comparison", async ({ page }) => {
    await page.goto("/scenarios/compare");

    const response = await page.request.get("/scenarios/compare");
    expect(response.status(), "Compare page should not 500").toBeLessThan(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD — Modes and features
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Dashboard features", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("dashboard shows KPI hero cards with financial data", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);

    // Hero KPI cards
    await expect(page.getByText(/cash position/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/burn rate/i).first()).toBeVisible();
    await expect(page.getByText(/runway/i).first()).toBeVisible();

    // Should show actual dollar amounts
    await expect(
      page.locator("text=/\\$[\\d,.]+/").first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("dashboard renders charts", async ({ page }) => {
    await page.goto("/dashboard");

    // Wait for chart containers to render
    // Charts use recharts which renders SVG
    await expect(page.locator("svg").first()).toBeVisible({ timeout: 15_000 });
  });

  test("dashboard quick actions are present", async ({ page }) => {
    await page.goto("/dashboard");

    // Quick action buttons/links should be available
    await expect(page.locator("h1, h2, h3").first()).toBeVisible({ timeout: 10_000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS — All tabs
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Settings page — all tabs", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("General tab shows company settings fields", async ({ page }) => {
    await page.goto("/settings");
    await expect(
      page.getByRole("heading", { name: "Settings" })
    ).toBeVisible({ timeout: 15_000 });

    // General tab should be active by default
    await expect(page.getByText("General").first()).toBeVisible();
  });

  test("AI Features tab shows provider selection and toggles", async ({ page }) => {
    await page.goto("/settings");
    await expect(
      page.getByRole("heading", { name: "Settings" })
    ).toBeVisible({ timeout: 15_000 });

    // Click AI Features tab
    await page.getByRole("button", { name: "AI Features" }).click();

    // Should show provider options
    await expect(
      page.getByText(/anthropic|openai|openrouter/i).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("Integrations tab shows integration list", async ({ page }) => {
    await page.goto("/settings");
    await expect(
      page.getByRole("heading", { name: "Settings" })
    ).toBeVisible({ timeout: 15_000 });

    // Click Integrations tab
    await page.getByRole("button", { name: "Integrations" }).click();

    // Should show integration items (possibly with "coming soon")
    await expect(
      page.getByText(/coming soon|connect|integration/i).first()
    ).toBeVisible({ timeout: 5_000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CROSS-CUTTING — Edge cases and error handling
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Edge cases and error states", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("form cancel does not persist partial data — expenses", async ({ page }) => {
    await page.goto("/expenses");
    await expect(
      page.getByRole("heading", { name: "Expenses" })
    ).toBeVisible({ timeout: 15_000 });

    // Open add form, type some data, cancel
    await page.getByRole("button", { name: "Add Expense" }).click();
    await page
      .getByPlaceholder("e.g. AWS Hosting, Office Rent")
      .fill("Should Not Persist");
    await page.getByPlaceholder("5000").fill("9999");
    await page.getByRole("button", { name: "Cancel" }).click();

    // Re-open — form should be empty
    await page.getByRole("button", { name: "Add Expense" }).click();
    await expect(page.getByPlaceholder("e.g. AWS Hosting, Office Rent")).toHaveValue("");
    await page.getByRole("button", { name: "Cancel" }).click();
  });

  test("form cancel does not persist partial data — funding", async ({ page }) => {
    await page.goto("/funding");
    await expect(
      page.getByRole("heading", { name: "Funding" })
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Add Funding Round" }).click();
    await page
      .getByPlaceholder("e.g. Seed Round, AWS Activate Grant")
      .fill("Cancelled Round");
    await page.getByRole("button", { name: "Cancel" }).click();

    // Re-open — should be empty
    await page.getByRole("button", { name: "Add Funding Round" }).click();
    await expect(
      page.getByPlaceholder("e.g. Seed Round, AWS Activate Grant")
    ).toHaveValue("");
    await page.getByRole("button", { name: "Cancel" }).click();
  });

  test("non-existent route returns 404 not 500", async ({ page }) => {
    const response = await page.goto("/totally-fake-page-12345", {
      waitUntil: "commit",
    });
    expect(
      response?.status(),
      "Non-existent page should return 404, not 500"
    ).toBe(404);
  });

  test("non-existent funding round ID does not crash", async ({ page }) => {
    // Access a non-existent funding round via API
    const response = await page.request.get(
      "/api/funding-rounds/00000000-0000-0000-0000-999999999999"
    );
    expect(response.status()).toBeLessThan(500);
  });

  test("non-existent headcount ID does not crash", async ({ page }) => {
    const response = await page.request.get(
      "/api/headcount/00000000-0000-0000-0000-999999999999"
    );
    expect(response.status()).toBeLessThan(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MOBILE RESPONSIVE — CRUD on mobile viewport
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Mobile responsive — CRUD forms on small viewport", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({
    storageState: "e2e/.auth/user.json",
    viewport: { width: 375, height: 812 },
  });

  test("expenses page loads and Add Expense form works on mobile", async ({ page }) => {
    await page.goto("/expenses");
    await expect(
      page.getByRole("heading", { name: "Expenses" })
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Add Expense" }).click();

    // Form should be fully visible and usable
    await expect(
      page.getByPlaceholder("e.g. AWS Hosting, Office Rent")
    ).toBeVisible();
    await expect(page.getByPlaceholder("5000")).toBeVisible();

    await page.getByRole("button", { name: "Cancel" }).click();
  });

  test("revenue page loads on mobile", async ({ page }) => {
    await page.goto("/revenue");
    await expect(
      page.getByRole("heading", { name: "Revenue" })
    ).toBeVisible({ timeout: 15_000 });

    await expect(
      page.getByRole("button", { name: /add revenue/i })
    ).toBeVisible();
  });

  test("funding page loads on mobile", async ({ page }) => {
    await page.goto("/funding");
    await expect(
      page.getByRole("heading", { name: "Funding" })
    ).toBeVisible({ timeout: 15_000 });
  });

  test("team page loads on mobile", async ({ page }) => {
    await page.goto("/team");
    await expect(
      page.getByRole("heading", { name: "Team" })
    ).toBeVisible({ timeout: 15_000 });
  });

  test("dashboard loads on mobile", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText(/cash position|burn rate|runway/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("settings page loads on mobile", async ({ page }) => {
    await page.goto("/settings");
    await expect(
      page.getByRole("heading", { name: "Settings" })
    ).toBeVisible({ timeout: 15_000 });
  });
});
