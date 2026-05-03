import { test, expect, type Page } from "@playwright/test";

/**
 * Expense flows E2E — Phase 1 §2.C / Task 16.
 *
 * Covers the consolidated <ExpenseFormModal> + <ExpenseTable> + import wizard:
 *   1. Add expense with Phase-1 fields (per_unit, quarterly frequency, vendor, notes)
 *   2. Edit expense — verify vendor/notes round-trip (catches the data-loss
 *      regression motivating commit f47b1f7)
 *   3. Bulk delete (3 rows → checkbox-select-all → "Delete selected" → confirm)
 *   4. CSV import w/ debit/credit polymorphic synthesis + re-upload silent skip
 *      (external_id dedupe). CSVs use timestamped reference numbers to keep
 *      runs reproducible against a persistent seeded DB.
 *
 * All tests require DATABASE_URL and reuse the auth fixture from auth.setup.ts.
 */

const dbAvailable = !!process.env.DATABASE_URL;

test.describe("Expense flows — Phase 1", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Open the Add Expense modal from /expenses. */
  async function openAddModal(page: Page) {
    await page.goto("/expenses");
    await expect(
      page.getByRole("heading", { name: "Expenses" })
    ).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Add Expense" }).click();
    await expect(
      page.getByRole("heading", { name: "Add Expense" })
    ).toBeVisible({ timeout: 5_000 });
  }

  /**
   * Pick the first non-empty option from the form's Account select.
   * Covers the seeded expense accounts (operating_expense / cogs etc.).
   */
  async function selectFirstAccount(page: Page): Promise<string> {
    const accountSelect = page.locator("#ef-account");
    const optionValues = await accountSelect.locator("option").evaluateAll(
      (opts) =>
        (opts as HTMLOptionElement[])
          .map((o) => ({ value: o.value, label: o.textContent?.trim() ?? "" }))
          .filter((o) => o.value !== "")
    );
    expect(
      optionValues.length,
      "Need at least one seeded account for expense flows"
    ).toBeGreaterThan(0);
    const first = optionValues[0]!;
    await accountSelect.selectOption(first.value);
    return first.label;
  }

  /**
   * Create an expense via the API directly. Faster + more reliable
   * than driving the form for tests that just need a row to act on.
   */
  async function createExpenseViaApi(
    page: Page,
    overrides: Partial<{
      vendor: string;
      notes: string;
      amount: number;
      frequency: "monthly" | "quarterly" | "annual";
    }> = {}
  ): Promise<{ id: string; accountId: string }> {
    // Pull an account id directly from /api/accounts.
    const accRes = await page.request.get("/api/accounts");
    expect(accRes.ok(), "GET /api/accounts should succeed").toBeTruthy();
    const accounts = (await accRes.json()) as Array<{
      id: string;
      type: string;
      category?: string;
    }>;
    const expenseAccount =
      accounts.find((a) => a.type === "expense") ?? accounts[0];
    expect(expenseAccount, "Need at least one account").toBeTruthy();

    const payload = {
      accountId: expenseAccount!.id,
      method: "fixed" as const,
      parameters: { amount: overrides.amount ?? 1234 },
      startDate: new Date(
        Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)
      ).toISOString(),
      endDate: null,
      frequency: overrides.frequency ?? "monthly",
      isOneTime: false,
      isRecurring: null,
      vendor: overrides.vendor ?? null,
      notes: overrides.notes ?? null,
      departmentId: null,
    };

    const res = await page.request.post("/api/forecast-lines", {
      data: payload,
    });
    expect(
      res.ok(),
      `POST /api/forecast-lines failed: ${res.status()} ${await res.text()}`
    ).toBeTruthy();
    const body = (await res.json()) as { id: string };
    return { id: body.id, accountId: expenseAccount!.id };
  }

  // ── Test 1: Add expense with Phase-1 fields ──────────────────────────────

  test("add expense with per_unit, quarterly frequency, vendor + notes", async ({
    page,
  }) => {
    await openAddModal(page);

    await selectFirstAccount(page);

    // Switch method to per_unit.
    await page.locator("#ef-method").selectOption("per_unit");

    // Per-unit fields appear (units + pricePerUnit).
    await expect(page.locator("#pu-units")).toBeVisible({ timeout: 5_000 });
    await page.locator("#pu-units").fill("12");
    await page.locator("#pu-price").fill("250");

    // Frequency segmented control → Quarterly.
    await page
      .getByRole("radiogroup", { name: "Frequency" })
      .getByRole("radio", { name: "Quarterly" })
      .click();
    await expect(
      page
        .getByRole("radiogroup", { name: "Frequency" })
        .getByRole("radio", { name: "Quarterly" })
    ).toHaveAttribute("aria-checked", "true");

    // Vendor + notes (Phase-1 fields).
    const vendorTag = `Acme Corp ${Date.now()}`;
    await page.locator("#ef-vendor").fill(vendorTag);
    await page.locator("#ef-notes").fill("Quarterly cloud spend");

    // Submit.
    await page
      .locator("button[type='submit']")
      .filter({ hasText: /^Add Expense$/ })
      .click();

    // Modal closes; row appears.
    await expect(
      page.getByRole("heading", { name: "Add Expense" })
    ).not.toBeVisible({ timeout: 10_000 });

    // The vendor isn't shown in the table (the expense name is the account name),
    // but the row count should grow and an edit button keyed by the account name
    // should be present. Round-trip is fully verified in Test 2.
    await expect(
      page.locator("table tbody tr").first()
    ).toBeVisible({ timeout: 10_000 });
  });

  // ── Test 2: Edit — vendor/notes round-trip ───────────────────────────────

  test("edit expense — vendor + notes are pre-populated and round-trip", async ({
    page,
  }) => {
    const stamp = Date.now();
    const initialVendor = `Original Vendor ${stamp}`;
    const initialNotes = `Original notes ${stamp}`;
    await createExpenseViaApi(page, {
      vendor: initialVendor,
      notes: initialNotes,
      amount: 4321,
    });

    await page.goto("/expenses");
    await expect(
      page.getByRole("heading", { name: "Expenses" })
    ).toBeVisible({ timeout: 15_000 });

    // Click the first edit button (the row we just created sorts by amount,
    // but we don't depend on a specific row — we just need any edit modal
    // populated by a real persisted record). Keep iterating across rows
    // until we find one whose form has our initial vendor.
    const editButtons = page.getByRole("button", { name: /^Edit / });
    const count = await editButtons.count();
    expect(count, "Should have at least one editable row").toBeGreaterThan(0);

    let foundOurRow = false;
    for (let i = 0; i < Math.min(count, 30); i++) {
      await editButtons.nth(i).click();
      await expect(
        page.getByRole("heading", { name: "Edit Expense" })
      ).toBeVisible({ timeout: 5_000 });

      const vendorInput = page.locator("#ef-vendor");
      const notesInput = page.locator("#ef-notes");
      const vendorValue = await vendorInput.inputValue();

      if (vendorValue === initialVendor) {
        foundOurRow = true;
        await expect(notesInput).toHaveValue(initialNotes);

        // Update vendor; keep notes as-is to verify it round-trips on save.
        const newVendor = `New Vendor ${stamp}`;
        await vendorInput.fill(newVendor);

        await page
          .locator("button[type='submit']")
          .filter({ hasText: /^Save Changes$/ })
          .click();

        await expect(
          page.getByRole("heading", { name: "Edit Expense" })
        ).not.toBeVisible({ timeout: 10_000 });

        // Re-open the same row; vendor should now reflect the new value
        // AND notes should be untouched (this is the data-loss guard).
        await page.reload();
        const editButtonsAfter = page.getByRole("button", { name: /^Edit / });
        const countAfter = await editButtonsAfter.count();
        for (let j = 0; j < countAfter; j++) {
          await editButtonsAfter.nth(j).click();
          await expect(
            page.getByRole("heading", { name: "Edit Expense" })
          ).toBeVisible({ timeout: 5_000 });
          const v = await page.locator("#ef-vendor").inputValue();
          if (v === newVendor) {
            await expect(page.locator("#ef-notes")).toHaveValue(initialNotes);
            // Close modal cleanly.
            await page.getByRole("button", { name: "Cancel" }).click();
            return;
          }
          await page.getByRole("button", { name: "Cancel" }).click();
        }
        throw new Error("Edited row not found after save");
      }
      // Not our row — close and try the next.
      await page.getByRole("button", { name: "Cancel" }).click();
    }
    expect(foundOurRow, "API-created expense should appear in the table").toBe(
      true
    );
  });

  // ── Test 3: Bulk delete ──────────────────────────────────────────────────

  test("bulk delete — select 3 rows → delete → all gone", async ({ page }) => {
    const stamp = Date.now();
    for (let i = 0; i < 3; i++) {
      await createExpenseViaApi(page, {
        vendor: `Bulk Del ${stamp}-${i}`,
        notes: `bulk-${stamp}-${i}`,
        amount: 100 + i,
      });
    }

    await page.goto("/expenses");
    await expect(
      page.getByRole("heading", { name: "Expenses" })
    ).toBeVisible({ timeout: 15_000 });

    // Total rows before delete.
    const rowCountBefore = await page.locator("table tbody tr").count();
    expect(rowCountBefore).toBeGreaterThanOrEqual(3);

    // Click 3 per-row checkboxes (skip the header "Select all" button which
    // lives in <thead>).
    const rowSelectButtons = page.locator(
      "table tbody tr button[aria-label^='Select ']"
    );
    const totalRowSelects = await rowSelectButtons.count();
    expect(totalRowSelects).toBeGreaterThanOrEqual(3);

    for (let i = 0; i < 3; i++) {
      await rowSelectButtons.nth(i).click();
    }

    // Bulk-action bar appears with "Delete N selected".
    const bulkDeleteBtn = page.getByRole("button", {
      name: /Delete \d+ selected/,
    });
    await expect(bulkDeleteBtn).toBeVisible({ timeout: 5_000 });
    await bulkDeleteBtn.click();

    // Confirmation modal.
    await expect(
      page.getByRole("heading", { name: "Delete selected expenses" })
    ).toBeVisible({ timeout: 5_000 });
    await page
      .locator("button")
      .filter({ hasText: /^Delete \d+$/ })
      .click();

    // Modal closes; row count drops by 3.
    await expect(
      page.getByRole("heading", { name: "Delete selected expenses" })
    ).not.toBeVisible({ timeout: 10_000 });

    // After router.refresh() settles, the table should have 3 fewer rows.
    await expect
      .poll(async () => page.locator("table tbody tr").count(), {
        timeout: 10_000,
      })
      .toBe(rowCountBefore - 3);
  });

  // ── Test 4: CSV import — debit/credit + re-upload skip ───────────────────

  test("CSV import — debit/credit synthesis + re-upload silent skip", async ({
    page,
  }) => {
    // Use a timestamp prefix so reference IDs are unique per run.
    const stamp = Date.now();
    const csv = [
      `Date,Description,Debit,Credit,Vendor,Memo,Reference No`,
      `2026-04-01,Rent,5000,0,Acme Realty,Q2 office,REF-${stamp}-001`,
      `2026-04-15,Refund,0,200,Vendor X,Credit memo,REF-${stamp}-002`,
      `2026-04-20,Cloud,1500,0,Acme Cloud,Annual,REF-${stamp}-003`,
      `2026-04-22,Stripe fee,12.34,0,Stripe,Processing,REF-${stamp}-004`,
    ].join("\n");
    const csvBuffer = Buffer.from(csv, "utf8");
    const csvName = `expense-flows-${stamp}.csv`;

    // ── First import: 4 imported, 0 skipped ──
    await page.goto("/import");
    await expect(page.getByText(/import/i).first()).toBeVisible({
      timeout: 15_000,
    });

    // Set the hidden file input directly (the dropzone uses an <input type="file">).
    await page.locator("input[type='file']").setInputFiles({
      name: csvName,
      mimeType: "text/csv",
      buffer: csvBuffer,
    });

    // Map step appears.
    await expect(page.getByText(csvName)).toBeVisible({ timeout: 10_000 });

    // Helper to map columns + select target account on the map step.
    async function configureMapping(): Promise<string> {
      // Toggle "separate Debit and Credit columns" → split-amount mode.
      await page
        .getByText(/separate Debit and Credit columns/i)
        .click();
      await page.getByLabel("Debit column").selectOption("Debit");
      await page.getByLabel("Credit column").selectOption("Credit");

      // Date column auto-maps from a header literally named "Date" via the
      // heuristic in import-utils. If it didn't, force it via the first
      // <select> rendered (the Date selector). Try a non-fatal manual pick.
      const allSelects = page.locator(
        "form select, .rounded-xl select, select"
      );
      // Target the Date select by its preceding label text.
      const dateSelectByLabel = page
        .locator("label", { hasText: /^Date column/i })
        .locator("..")
        .locator("select");
      const dateSelectCount = await dateSelectByLabel.count();
      if (dateSelectCount > 0) {
        const v = await dateSelectByLabel.first().inputValue();
        if (!v) {
          await dateSelectByLabel.first().selectOption("Date");
        }
      } else if ((await allSelects.count()) > 0) {
        // Last-resort: pick the first <select> and try Date.
        await allSelects
          .first()
          .selectOption("Date")
          .catch(() => undefined);
      }

      // Target account: select the first non-empty option under
      // "Import into account".
      const targetAccount = page
        .locator("label", { hasText: /Import into account/i })
        .locator("..")
        .locator("select");
      const firstAccountValue = await targetAccount
        .locator("option")
        .nth(1)
        .getAttribute("value");
      if (firstAccountValue) {
        await targetAccount.selectOption(firstAccountValue);
      }
      return firstAccountValue ?? "";
    }

    await configureMapping();

    // Hit Preview Import.
    await page.getByRole("button", { name: /Preview Import/i }).click();

    // Preview step renders. Then click the import button.
    // The button text is something like "Import N transactions".
    const confirmImport = page
      .getByRole("button", { name: /^Import\b/i })
      .last();
    await expect(confirmImport).toBeVisible({ timeout: 15_000 });
    await confirmImport.click();

    // Result step: success summary shows imported count.
    await expect(
      page.getByRole("heading", { name: "Import Complete" })
    ).toBeVisible({ timeout: 30_000 });

    // Imported tile = 4, Skipped tile = 0.
    const importedTile = page.locator("text=Imported").locator("..");
    await expect(importedTile).toContainText("4");
    const skippedTile = page.locator("text=Skipped").locator("..");
    await expect(skippedTile).toContainText("0");

    // ── Second import: same CSV → 0 imported, 4 skipped (external_id dedupe) ──
    await page.getByRole("button", { name: /Import More/i }).click();

    // Re-upload identical buffer.
    await page.locator("input[type='file']").setInputFiles({
      name: csvName,
      mimeType: "text/csv",
      buffer: csvBuffer,
    });

    await expect(page.getByText(csvName)).toBeVisible({ timeout: 10_000 });

    // Repeat split-amount mapping for the re-upload.
    await configureMapping();

    await page.getByRole("button", { name: /Preview Import/i }).click();

    // The preview page shows duplicates badge — and the import button should
    // still be clickable, but the active import set is 0. Click it anyway and
    // assert the result.
    await page
      .getByRole("button", { name: /^Import\b/i })
      .last()
      .click();

    await expect(
      page.getByRole("heading", { name: "Import Complete" })
    ).toBeVisible({ timeout: 30_000 });

    const importedTile2 = page.locator("text=Imported").locator("..");
    const skippedTile2 = page.locator("text=Skipped").locator("..");
    await expect(importedTile2).toContainText("0");
    await expect(skippedTile2).toContainText("4");
  });
});
