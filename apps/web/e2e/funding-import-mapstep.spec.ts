// apps/web/e2e/funding-import-mapstep.spec.ts
//
// RED guard for DATA-01: the import Map step is target-blind — it is hardcoded to
// the transaction column shape, so choosing "Funding Rounds" and uploading a
// funding CSV never renders Name / Round Type column mappers (and the preview
// always throws "Please map the Name, Round Type, Amount, and Date columns").
// This spec asserts the FIXED behavior: the Map step exposes Name + Round Type
// mappers for a funding import. RED against today's app (transaction fields only).
import { test, expect } from "@playwright/test";

const FUNDING_CSV = [
  "Round Name,Type,Amount Raised,Signing Date",
  "Seed Round,seed,1500000,2025-01-15",
  "Series A,series_a,6000000,2025-09-01",
].join("\n");

test.describe("Funding import Map step (DATA-01)", () => {
  test.use({ storageState: "e2e/.auth/user.json" });

  test("choosing Funding Rounds + uploading a funding CSV shows Name + Round Type mappers", async ({
    page,
  }) => {
    await page.goto("/import");

    // Select the funding import target on the upload step.
    await page.getByLabel(/import type/i).selectOption("funding-rounds");

    // Upload the funding CSV via the hidden file input.
    await page.locator('input[type="file"]').setInputFiles({
      name: "funding.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(FUNDING_CSV),
    });

    // We should advance to the Map step.
    await expect(page.getByText(/map columns/i).first()).toBeVisible({
      timeout: 15_000,
    });

    // FIXED contract: funding-specific mappers exist (Name + Round Type).
    await expect(page.getByText(/round type/i).first()).toBeVisible();
    await expect(page.getByText(/\bname\b/i).first()).toBeVisible();

    // And the transaction-only mapper (Import into account) must NOT be the shape shown.
    await expect(page.getByText(/import into account/i)).toHaveCount(0);
  });
});
