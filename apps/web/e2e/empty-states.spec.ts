// apps/web/e2e/empty-states.spec.ts
//
// RED guard for ESL-1 (systemic) + FUND-05 / FUND-08: the cap-table view renders
// all-zero chips and a header-only table (no rows) when a company has no share
// data, instead of a meaningful empty-state with guidance + a back link to
// /funding. This spec asserts the FIXED behavior and is RED against today's app
// (which shows "0 shares fully diluted", four "0.0%" Stat chips, and no copy).
import { test, expect } from "@playwright/test";

test.describe("Cap table empty-state (ESL-1, FUND-05)", () => {
  test.use({ storageState: "e2e/.auth/user.json" });

  test("with no share data, shows an empty-state message + a back link to /funding", async ({
    page,
  }) => {
    await page.goto("/funding/cap-table");

    // FIXED contract (1): a meaningful empty-state explaining that share classes /
    // equity grants are needed — NOT a grid of zeros.
    await expect(
      page.getByText(/no share data|add share classes|equity grants/i).first(),
    ).toBeVisible();

    // FIXED contract (2): the misleading all-zero chips must NOT be the page body.
    await expect(page.getByText("0 shares fully diluted")).toHaveCount(0);
    await expect(page.getByText(/^0\.0%$/)).toHaveCount(0);

    // FIXED contract (3): a back link to /funding so the orphaned page is escapable.
    await expect(
      page.getByRole("link", { name: /back to funding|funding/i }).first(),
    ).toHaveAttribute("href", /\/funding(?!\/cap-table)/);
  });
});
