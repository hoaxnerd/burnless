// apps/web/e2e/scenario-active-delete.spec.ts
//
// RED guard for SCN-01: deleting the currently-active scenario from the card menu
// only fires DELETE + router.refresh() — it never calls exitScenario(), so the
// active-scenario cookie/sessionStorage survive, the SCENARIO banner stays
// mounted, and its effects keep polling the now-404 overrides endpoint for the
// deleted id. This spec asserts the FIXED behavior: the banner unmounts and there
// is NO 404 polling of the overrides endpoint after deleting the active scenario.
import { test, expect } from "@playwright/test";

test.describe("Active scenario delete cleanup (SCN-01)", () => {
  test.use({ storageState: "e2e/.auth/user.json" });

  test("deleting the active scenario unmounts the banner and stops 404 overrides polling", async ({
    page,
  }) => {
    // Enter a scenario so it becomes active (cookie + sessionStorage + banner).
    await page.goto("/scenarios");
    await page.getByRole("button", { name: /enter sandbox/i }).first().click();
    await expect(page.locator("text=SCENARIO:")).toBeVisible({ timeout: 15_000 });

    // Capture the active scenario id from the cookie set by enterScenario.
    const cookies = await page.context().cookies();
    const activeId = cookies.find((c) => c.name === "active-scenario-id")?.value;
    expect(activeId, "active-scenario-id cookie should be set").toBeTruthy();

    // Watch for any 404 on the overrides/scenario endpoints for the deleted id.
    const phantom404s: string[] = [];
    page.on("response", (res) => {
      const url = res.url();
      if (
        res.status() === 404 &&
        activeId &&
        url.includes(activeId) &&
        (url.includes("/api/scenarios/overrides") ||
          url.includes(`/api/scenarios/${activeId}`))
      ) {
        phantom404s.push(url);
      }
    });

    // Delete the active scenario from its card "More actions" menu.
    await page.getByRole("button", { name: /more actions/i }).first().click();
    await page.getByRole("menuitem", { name: /delete/i }).first().click();

    // FIXED contract (1): banner unmounts (exitScenario ran).
    await expect(page.locator("text=SCENARIO:")).toHaveCount(0, {
      timeout: 15_000,
    });

    // FIXED contract (2): cookie cleared.
    const after = await page.context().cookies();
    expect(after.find((c) => c.name === "active-scenario-id")?.value).toBeFalsy();

    // FIXED contract (3): no 404 polling of the deleted scenario's overrides.
    await page.waitForTimeout(2_000);
    expect(phantom404s, `phantom 404 polling: ${phantom404s.join(", ")}`).toEqual(
      [],
    );
  });
});
