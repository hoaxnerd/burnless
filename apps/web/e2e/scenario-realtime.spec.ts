// apps/web/e2e/scenario-realtime.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Scenario realtime read path (Phase 4 A)", () => {
  test.use({ storageState: "e2e/.auth/user.json" });

  test("edits to a stream inside a scenario surface in the list", async ({ page }) => {
    // Auth is provided by the storageState in playwright.config.ts projects[2].
    await page.goto("/scenarios");
    await page.getByRole("button", { name: "Enter sandbox" }).first().click();
    await page.waitForURL("**/scenarios");
    await expect(page.locator("text=SCENARIO:")).toBeVisible();

    await page.goto("/revenue");
    const editBtn = page.locator('button[aria-label^="Edit "]').first();
    const originalLabel = await editBtn.getAttribute("aria-label");
    expect(originalLabel).toMatch(/^Edit /);
    await editBtn.click();

    const renameTo = `realtime-spec-${Date.now()}`;
    await page.getByRole("textbox", { name: "Revenue stream name" }).fill(renameTo);
    await page.getByRole("button", { name: "Save changes" }).click();

    // The list should re-render with the new name without a full reload.
    await expect(page.locator(`button[aria-label="Edit ${renameTo}"]`)).toBeVisible({ timeout: 5_000 });

    // And after an explicit reload, it should still show the override.
    await page.reload();
    await expect(page.locator(`button[aria-label="Edit ${renameTo}"]`)).toBeVisible();
  });
});
