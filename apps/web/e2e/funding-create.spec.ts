// apps/web/e2e/funding-create.spec.ts
//
// RED guard for FUND-01 (BLOCKER): creating a funding round fails with a 400
// because the Add form sends `roundType` while createFundingRoundSchema requires
// `type`. This spec asserts the FIXED behavior — the round is created, the dialog
// closes, no 400 surfaces, and the new row appears. It is RED against today's app.
import { test, expect } from "@playwright/test";

test.describe("Funding round creation (FUND-01 blocker)", () => {
  test.use({ storageState: "e2e/.auth/user.json" });

  test("Add Funding Round with a name + positive amount creates the round (no 400)", async ({
    page,
  }) => {
    const roundName = `Create-Spec ${Date.now()}`;

    // Capture the create POST so we can assert it did NOT 400.
    const createResponse = page.waitForResponse(
      (res) =>
        res.url().includes("/api/funding-rounds") &&
        res.request().method() === "POST",
      { timeout: 15_000 },
    );

    await page.goto("/funding");
    await page.getByRole("button", { name: /add funding round/i }).click();

    // Add dialog is open.
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.getByLabel("Round name").fill(roundName);
    await page.getByLabel("Round type").selectOption("seed");
    await page.getByLabel("Total amount").fill("750000");

    await page.getByRole("button", { name: /^save$/i }).click();

    // FIXED contract: the POST succeeds (2xx), not a 400.
    const res = await createResponse;
    expect(res.status(), "create funding round must not 400").toBeLessThan(400);

    // Dialog closes on success...
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 10_000 });

    // ...and the new row appears in the list without a manual reload.
    await expect(page.getByText(roundName)).toBeVisible({ timeout: 15_000 });

    // No raw-Zod / generic error string should be rendered.
    await expect(page.getByText(/"code"|"path"|invalid request body/i)).toHaveCount(
      0,
    );
  });
});
