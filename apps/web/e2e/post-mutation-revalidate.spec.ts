// apps/web/e2e/post-mutation-revalidate.spec.ts
//
// RED guard for PMR-1 / DFL-01 (systemic) + FUND-06: the funding EDIT flow only
// calls onClose() (no router.refresh / SWR revalidate), so the server-rendered
// funding cards keep stale values until a manual full reload. The Add and Delete
// flows DO refresh — proving the asymmetry. This spec asserts the FIXED behavior:
// after editing a funding round amount the card updates WITHOUT a manual reload.
import { test, expect } from "@playwright/test";

test.describe("Post-mutation revalidation on edit (PMR-1, DFL-01, FUND-06)", () => {
  test.use({ storageState: "e2e/.auth/user.json" });

  test("editing a funding round amount updates the page without a manual reload", async ({
    page,
  }) => {
    const roundName = `Revalidate-Spec ${Date.now()}`;

    // Create a round to edit (uses the Add flow, which already refreshes).
    await page.goto("/funding");
    await page.getByRole("button", { name: /add funding round/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByLabel("Round name").fill(roundName);
    await page.getByLabel("Round type").selectOption("seed");
    await page.getByLabel("Total amount").fill("500000");
    await page.getByRole("button", { name: /^save$/i }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(roundName)).toBeVisible({ timeout: 15_000 });

    // Open the EDIT flow for that round.
    await page.getByText(roundName).click();
    await page.getByRole("button", { name: /^edit$/i }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // Change the amount to a new, recognizable value.
    const newAmount = "987654";
    await page.getByLabel("Total amount").fill(newAmount);
    await page.getByRole("button", { name: /^save$/i }).click();

    // Dialog closes on save.
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 10_000 });

    // FIXED contract: the new amount appears WITHOUT any manual reload
    // (formatted as $987,654 by the currency formatter). RED today (stale value
    // until page.reload()).
    await expect(page.getByText(/987,654/).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
