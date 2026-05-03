import { test, expect } from "@playwright/test";

/**
 * Revenue Stream Flows — Phase 1 §2.B Task 18
 *
 * Covers the full lifecycle for a marketplace-type revenue stream:
 *   create → persist → delete.
 *
 * Selector notes (from source inspection):
 *  - Add button: <button> "Add Revenue Stream" in add-revenue-stream-button.tsx
 *  - Form: aria-label="Add revenue stream" (revenue-stream-form.tsx)
 *  - Name input: aria-label="Revenue stream name"
 *  - Type select: aria-label="Revenue stream type"
 *  - Start date input: aria-label="Start date" (DateRangePicker.tsx)
 *  - MarketplaceFields use CurrencyInput + PercentageInput, each with aria-label matching their label prop:
 *      "Starting GMV", "Take rate", "GMV growth rate"
 *  - PercentageInput takes display values 0-100 (e.g. "15" for 15%), stores 0-1 internally.
 *  - Delete button: aria-label=`Delete ${stream.name}` in revenue-stream-breakdown.tsx (hover-revealed).
 *    Uses window.confirm() natively — no modal confirm button; Playwright auto-accepts dialogs.
 *  - The new stream appears in both:
 *      (a) The "Revenue Streams" table (revenue-streams-list.tsx) — no delete control here.
 *      (b) The "Revenue Mix" panel (revenue-stream-breakdown.tsx) — has edit + delete controls.
 */

const dbAvailable = !!process.env.DATABASE_URL;

test.describe("Revenue stream flows — Phase 1", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("create marketplace stream w/ date range, persist, delete", async ({
    page,
  }) => {
    const name = `E2E Marketplace ${Date.now()}`;

    // ── Navigate ──────────────────────────────────────────────────────────
    await page.goto("/revenue");
    await expect(
      page.getByRole("heading", { name: "Revenue" })
    ).toBeVisible({ timeout: 10_000 });

    // ── Open add modal ────────────────────────────────────────────────────
    await page.getByRole("button", { name: /add revenue/i }).first().click();

    // ── Fill shared fields ────────────────────────────────────────────────
    await page.getByLabel("Revenue stream name").fill(name);
    await page.getByLabel("Revenue stream type").selectOption("marketplace");

    // Start date — aria-label="Start date" on the <input type="date">
    await page.getByLabel("Start date").fill("2026-06-01");

    // ── Fill marketplace-specific fields ──────────────────────────────────
    // CurrencyInput: aria-label="Starting GMV", raw numeric value
    await page.getByLabel("Starting GMV").fill("100000");

    // PercentageInput: aria-label="Take rate", display value 0-100 (15 = 15%)
    await page.getByLabel("Take rate").fill("15");

    // PercentageInput: aria-label="GMV growth rate", display value 0-100 (5 = 5%)
    await page.getByLabel("GMV growth rate").fill("5");

    // ── Auto-accept window.confirm() for any native dialogs ───────────────
    page.on("dialog", (dialog) => dialog.accept());

    // ── Submit ────────────────────────────────────────────────────────────
    await page.getByRole("button", { name: /^add stream$/i }).click();

    // ── Wait for stream to appear ─────────────────────────────────────────
    // Appears as stream name text in either the table or the breakdown panel.
    await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });

    // ── Reload — assert persistence ───────────────────────────────────────
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Revenue" })
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });

    // ── Delete ────────────────────────────────────────────────────────────
    // The delete button is in the "Revenue Mix" panel (revenue-stream-breakdown.tsx).
    // It has aria-label=`Delete ${stream.name}` and is hover-revealed (CSS opacity).
    // We hover the parent container to make it visible, then click.
    const deleteBtn = page.getByRole("button", { name: `Delete ${name}` });

    // Hover the element containing the stream name to reveal the action buttons.
    // The button is already in the DOM (opacity-0); hovering reveals it visually,
    // but Playwright can click aria-labeled buttons regardless of CSS visibility.
    await deleteBtn.click({ force: true });

    // window.confirm is auto-accepted via the dialog handler above.

    // ── Assert gone ───────────────────────────────────────────────────────
    await expect(page.getByText(name)).toBeHidden({ timeout: 10_000 });
  });
});
