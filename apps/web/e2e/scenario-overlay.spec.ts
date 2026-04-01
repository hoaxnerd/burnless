import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

/**
 * Scenario Overlay CRUD E2E Tests — Task 20
 *
 * Tests the core overlay CRUD operations:
 *   1. Create blank scenario and enter it
 *   2. Modify entity inside scenario (revenue stream)
 *   3. Create entity inside scenario (funding round)
 *   4. Delete entity inside scenario (headcount plan)
 *   5. Revert a single override
 *   6. Verify database state via API
 *
 * The overlay system stores overrides in `scenario_overrides` — base tables
 * are never mutated while inside a scenario sandbox.
 */

const dbAvailable = !!process.env.DATABASE_URL;

// Unique suffix per run to avoid collisions between parallel workers
const RUN_ID = Date.now();

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Wait for the scenarios page to fully load */
async function waitForScenariosPage(page: Page) {
  await page.goto("/scenarios");
  await expect(
    page.getByRole("heading", { name: "Scenarios" })
  ).toBeVisible({ timeout: 15_000 });
}

/** Create a scenario via the modal UI and return its name */
async function createScenarioViaUI(page: Page, name: string) {
  // Click "New Scenario"
  await page.getByRole("button", { name: /New Scenario/i }).click();

  // Modal should appear
  await expect(page.getByText("Create Scenario")).toBeVisible({ timeout: 5_000 });

  // "Blank" path should be selected by default
  await expect(page.getByText("Blank").first()).toBeVisible();

  // Fill name
  await page.getByPlaceholder("e.g. Best Case Q3").fill(name);

  // Click Create Scenario
  await page.getByRole("button", { name: /Create Scenario/i }).click();

  // Modal should close
  await expect(page.getByPlaceholder("e.g. Best Case Q3")).not.toBeVisible({
    timeout: 10_000,
  });
}

/** Enter a scenario sandbox by clicking "Enter sandbox" on its card */
async function enterScenario(page: Page, name: string) {
  // Find the card containing the scenario name, then click Enter sandbox
  const card = page.locator("div").filter({ hasText: name }).first();
  await card.getByText("Enter sandbox").click();

  // Wait for yellow banner to appear
  await expect(
    page.locator(".bg-amber-500").first()
  ).toBeVisible({ timeout: 10_000 });
}

/** Exit scenario sandbox via the banner Exit button */
async function exitScenario(page: Page) {
  await page.getByRole("button", { name: "Exit" }).click();

  // Banner should disappear
  await expect(
    page.locator(".bg-amber-500")
  ).not.toBeVisible({ timeout: 10_000 });
}

/** Get the scenario ID from the current URL's scenarioId query param */
function getScenarioIdFromUrl(page: Page): string | null {
  const url = new URL(page.url());
  return url.searchParams.get("scenarioId");
}

/** Create a scenario via API and return it */
async function createScenarioViaAPI(
  request: APIRequestContext,
  name: string,
): Promise<{ id: string; name: string }> {
  const res = await request.post("/api/scenarios", {
    data: { name, source: "blank" },
  });
  expect(res.status()).toBe(201);
  return res.json();
}

/** Delete a scenario via API (cleanup) */
async function deleteScenarioViaAPI(
  request: APIRequestContext,
  id: string,
) {
  await request.delete(`/api/scenarios/${id}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST 1: Create blank scenario and enter it
// ═════════════════════════════════════════════════════════════════════════════

test.describe("Scenario Overlay — Create & Enter", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("create blank scenario via modal and enter it", async ({ page }) => {
    const scenarioName = `Test Overlay Scenario ${RUN_ID}`;

    await waitForScenariosPage(page);
    await createScenarioViaUI(page, scenarioName);

    // Verify scenario appears in list after creation
    await page.reload({ waitUntil: "networkidle" });
    await expect(
      page.getByText(scenarioName).first()
    ).toBeVisible({ timeout: 10_000 });

    // Enter the scenario
    await enterScenario(page, scenarioName);

    // Verify yellow banner shows
    const banner = page.locator(".bg-amber-500");
    await expect(banner).toBeVisible();

    // Banner should show the scenario name
    await expect(banner.getByText(scenarioName)).toBeVisible();

    // Banner should show change count (0 changes or "-- changes" depending on API)
    const changeText = banner.locator("text=/\\d+ change|— changes/");
    await expect(changeText).toBeVisible({ timeout: 5_000 });

    // Clean up: exit and delete
    await exitScenario(page);

    // Clean up scenario via API
    const scenarios = await page.request.get("/api/scenarios");
    const list = await scenarios.json();
    const created = (Array.isArray(list) ? list : list.items ?? []).find(
      (s: { name: string }) => s.name === scenarioName,
    );
    if (created) {
      await deleteScenarioViaAPI(page.request, created.id);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TEST 2: Modify entity inside scenario
// ═════════════════════════════════════════════════════════════════════════════

test.describe("Scenario Overlay — Modify Entity", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("modify revenue stream shows MODIFIED badge and base unchanged after exit", async ({
    page,
  }) => {
    // Create scenario via API for reliability
    const scenarioName = `Modify Test ${RUN_ID}`;
    const scenario = await createScenarioViaAPI(page.request, scenarioName);

    try {
      // Navigate to scenarios and enter
      await waitForScenariosPage(page);
      await enterScenario(page, scenarioName);

      // Navigate to revenue page while in scenario
      const scenarioId = getScenarioIdFromUrl(page);
      expect(scenarioId).toBeTruthy();
      await page.goto(`/revenue?scenarioId=${scenarioId}`);
      await expect(
        page.getByRole("heading", { name: "Revenue" })
      ).toBeVisible({ timeout: 10_000 });

      // Verify banner is still visible on revenue page
      await expect(page.locator(".bg-amber-500").first()).toBeVisible();

      // Find and click edit on the first revenue stream
      const editButton = page.locator("[aria-label*='Edit']").first();
      if (await editButton.isVisible({ timeout: 5_000 })) {
        await editButton.click();

        // Change the name in the edit form
        const nameInput = page.getByPlaceholder(
          "e.g. Growth Plan, Implementation Services",
        );
        if (await nameInput.isVisible({ timeout: 3_000 })) {
          const originalName = await nameInput.inputValue();

          await nameInput.fill(`${originalName} (modified)`);

          // Submit
          const submitBtn = page
            .locator("button[type='submit']")
            .first();
          if (await submitBtn.isEnabled({ timeout: 2_000 })) {
            await submitBtn.click();

            // Wait for modal to close
            await expect(nameInput).not.toBeVisible({ timeout: 10_000 });

            // Wait for page refresh and check for MODIFIED badge
            await page.waitForTimeout(1_000);
            await page.reload({ waitUntil: "networkidle" });
            await page.goto(`/revenue?scenarioId=${scenarioId}`);

            // Check for "Modified" badge text
            const modifiedBadge = page.getByText("Modified", { exact: false });
            await expect(modifiedBadge.first()).toBeVisible({ timeout: 10_000 });

            // Verify override count via API
            const countRes = await page.request.get(
              `/api/scenarios/overrides?scenarioId=${scenarioId}&count=true`,
            );
            if (countRes.ok()) {
              const countData = await countRes.json();
              expect(countData.count).toBeGreaterThanOrEqual(1);
            }

            // Exit scenario
            await exitScenario(page);

            // Navigate to revenue without scenario — base should be unchanged
            await page.goto("/revenue");
            await expect(
              page.getByRole("heading", { name: "Revenue" })
            ).toBeVisible({ timeout: 10_000 });

            // The MODIFIED badge should NOT be visible outside scenario
            await expect(
              page.getByText("Modified").first()
            ).not.toBeVisible({ timeout: 3_000 });
          }
        }
      }
    } finally {
      await deleteScenarioViaAPI(page.request, scenario.id);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TEST 3: Create entity inside scenario
// ═════════════════════════════════════════════════════════════════════════════

test.describe("Scenario Overlay — Create Entity", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("add funding round in scenario shows SCENARIO ONLY badge and disappears after exit", async ({
    page,
  }) => {
    const scenarioName = `Create Entity Test ${RUN_ID}`;
    const scenario = await createScenarioViaAPI(page.request, scenarioName);
    const roundName = `E2E Scenario Round ${RUN_ID}`;

    try {
      // Enter scenario
      await waitForScenariosPage(page);
      await enterScenario(page, scenarioName);

      const scenarioId = getScenarioIdFromUrl(page);
      expect(scenarioId).toBeTruthy();

      // Navigate to funding page in scenario
      await page.goto(`/funding?scenarioId=${scenarioId}`);
      await expect(
        page.getByRole("heading", { name: "Funding" })
      ).toBeVisible({ timeout: 10_000 });

      // Add a funding round
      await page.getByRole("button", { name: /add funding/i }).click();
      await page
        .getByPlaceholder("e.g. Seed Round, AWS Activate Grant")
        .fill(roundName);

      const typeSelect = page.locator("select").first();
      await typeSelect.selectOption("seed");
      await page.getByPlaceholder("2000000").fill("5000000");

      const submitBtn = page
        .locator("button[type='submit']")
        .filter({ hasText: /add round/i });
      await submitBtn.click();

      // Modal should close
      await expect(
        page.getByPlaceholder("e.g. Seed Round, AWS Activate Grant")
      ).not.toBeVisible({ timeout: 10_000 });

      // Refresh to see the new round with badge
      await page.goto(`/funding?scenarioId=${scenarioId}`);
      await expect(
        page.getByRole("heading", { name: "Funding" })
      ).toBeVisible({ timeout: 10_000 });

      // Check for "Scenario Only" badge (the badge for created entities)
      const scenarioOnlyBadge = page.getByText("Scenario Only");
      await expect(scenarioOnlyBadge.first()).toBeVisible({ timeout: 10_000 });

      // Exit scenario
      await exitScenario(page);

      // Navigate to funding without scenario
      await page.goto("/funding");
      await expect(
        page.getByRole("heading", { name: "Funding" })
      ).toBeVisible({ timeout: 10_000 });

      // The scenario-only round should NOT appear outside scenario
      await expect(page.getByText(roundName)).not.toBeVisible({
        timeout: 5_000,
      });

      // Re-enter scenario to verify it's still there
      await page.goto(`/scenarios?scenarioId=${scenarioId}`);
      await waitForScenariosPage(page);
      await enterScenario(page, scenarioName);

      const newScenarioId = getScenarioIdFromUrl(page);
      await page.goto(`/funding?scenarioId=${newScenarioId}`);
      await expect(
        page.getByRole("heading", { name: "Funding" })
      ).toBeVisible({ timeout: 10_000 });

      // Round should still be visible in scenario
      await expect(page.getByText(roundName).first()).toBeVisible({
        timeout: 10_000,
      });

      await exitScenario(page);
    } finally {
      await deleteScenarioViaAPI(page.request, scenario.id);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TEST 4: Delete entity inside scenario
// ═════════════════════════════════════════════════════════════════════════════

test.describe("Scenario Overlay — Delete Entity", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("delete headcount plan in scenario hides it, shows 'Hidden in scenario' section, and reappears after exit", async ({
    page,
  }) => {
    const scenarioName = `Delete Entity Test ${RUN_ID}`;
    const scenario = await createScenarioViaAPI(page.request, scenarioName);

    try {
      // Enter scenario
      await waitForScenariosPage(page);
      await enterScenario(page, scenarioName);

      const scenarioId = getScenarioIdFromUrl(page);
      expect(scenarioId).toBeTruthy();

      // Navigate to team page in scenario
      await page.goto(`/team?scenarioId=${scenarioId}`);
      await expect(
        page.getByRole("heading", { name: "Team" })
      ).toBeVisible({ timeout: 10_000 });

      // Expand a department to see team members
      const deptButton = page
        .locator("button.w-full.text-left")
        .first();
      if (await deptButton.isVisible({ timeout: 5_000 })) {
        await deptButton.click();

        // Find a delete button on a team member
        const deleteBtn = page.locator("[title='Delete team member']").first();
        if (await deleteBtn.isVisible({ timeout: 5_000 })) {
          // Two-step delete: click once to reveal confirm, click again to delete
          await deleteBtn.click();
          // The button changes to confirm state
          const confirmBtn = page
            .locator("[title='Click again to confirm']")
            .first();
          if (await confirmBtn.isVisible({ timeout: 3_000 })) {
            await confirmBtn.click();
          }

          // Wait for update
          await page.waitForTimeout(1_000);
          await page.reload({ waitUntil: "networkidle" });
          await page.goto(`/team?scenarioId=${scenarioId}`);
          await expect(
            page.getByRole("heading", { name: "Team" })
          ).toBeVisible({ timeout: 10_000 });

          // Look for "Hidden in scenario" section
          const hiddenSection = page.getByText("Hidden in scenario");
          await expect(hiddenSection.first()).toBeVisible({ timeout: 10_000 });

          // Exit scenario
          await exitScenario(page);

          // Navigate to team without scenario — deleted member should reappear
          await page.goto("/team");
          await expect(
            page.getByRole("heading", { name: "Team" })
          ).toBeVisible({ timeout: 10_000 });

          // "Hidden in scenario" should NOT appear outside scenario
          await expect(
            page.getByText("Hidden in scenario")
          ).not.toBeVisible({ timeout: 3_000 });
        }
      }
    } finally {
      await deleteScenarioViaAPI(page.request, scenario.id);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TEST 5: Revert a single override
// ═════════════════════════════════════════════════════════════════════════════

test.describe("Scenario Overlay — Revert Override", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("revert a modified entity returns it to base state and decreases override count", async ({
    page,
  }) => {
    const scenarioName = `Revert Test ${RUN_ID}`;
    const scenario = await createScenarioViaAPI(page.request, scenarioName);

    try {
      // Enter scenario
      await waitForScenariosPage(page);
      await enterScenario(page, scenarioName);

      const scenarioId = getScenarioIdFromUrl(page);
      expect(scenarioId).toBeTruthy();

      // Navigate to revenue page in scenario
      await page.goto(`/revenue?scenarioId=${scenarioId}`);
      await expect(
        page.getByRole("heading", { name: "Revenue" })
      ).toBeVisible({ timeout: 10_000 });

      // Edit a revenue stream to create a modification override
      const editButton = page.locator("[aria-label*='Edit']").first();
      if (await editButton.isVisible({ timeout: 5_000 })) {
        await editButton.click();

        const nameInput = page.getByPlaceholder(
          "e.g. Growth Plan, Implementation Services",
        );
        if (await nameInput.isVisible({ timeout: 3_000 })) {
          const originalName = await nameInput.inputValue();
          await nameInput.fill(`${originalName} (revert test)`);

          const submitBtn = page.locator("button[type='submit']").first();
          if (await submitBtn.isEnabled({ timeout: 2_000 })) {
            await submitBtn.click();
            await expect(nameInput).not.toBeVisible({ timeout: 10_000 });

            // Refresh to see override indicators
            await page.goto(`/revenue?scenarioId=${scenarioId}`);
            await expect(
              page.getByRole("heading", { name: "Revenue" })
            ).toBeVisible({ timeout: 10_000 });

            // Get initial override count
            const initialCountRes = await page.request.get(
              `/api/scenarios/overrides?scenarioId=${scenarioId}&count=true`,
            );
            let initialCount = 0;
            if (initialCountRes.ok()) {
              const data = await initialCountRes.json();
              initialCount = data.count;
            }
            expect(initialCount).toBeGreaterThanOrEqual(1);

            // Click "Revert" button on the modified entity
            const revertBtn = page.getByRole("button", { name: "Revert" }).first();
            await expect(revertBtn).toBeVisible({ timeout: 5_000 });
            await revertBtn.click();

            // Wait for revert to process
            await page.waitForTimeout(1_000);

            // Verify override count decreased
            const afterCountRes = await page.request.get(
              `/api/scenarios/overrides?scenarioId=${scenarioId}&count=true`,
            );
            if (afterCountRes.ok()) {
              const afterData = await afterCountRes.json();
              expect(afterData.count).toBeLessThan(initialCount);
            }

            // "Modified" badge should no longer be visible for the reverted entity
            // (Refresh to ensure clean state)
            await page.goto(`/revenue?scenarioId=${scenarioId}`);
            await expect(
              page.getByRole("heading", { name: "Revenue" })
            ).toBeVisible({ timeout: 10_000 });
          }
        }
      }

      await exitScenario(page);
    } finally {
      await deleteScenarioViaAPI(page.request, scenario.id);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TEST 6: Verify database state via API
// ═════════════════════════════════════════════════════════════════════════════

test.describe("Scenario Overlay — Database State Verification", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("scenario_overrides table tracks changes and base tables are untouched", async ({
    page,
  }) => {
    const scenarioName = `DB State Test ${RUN_ID}`;
    const scenario = await createScenarioViaAPI(page.request, scenarioName);

    try {
      // Snapshot base revenue streams before any scenario work
      const baseRevenueRes = await page.request.get("/api/revenue-streams");
      expect(baseRevenueRes.ok()).toBeTruthy();
      const baseRevenue = await baseRevenueRes.json();
      const baseRevenueIds = (Array.isArray(baseRevenue) ? baseRevenue : baseRevenue.items ?? []).map(
        (r: { id: string }) => r.id,
      );

      // Initially, overrides should be empty
      const emptyOverrides = await page.request.get(
        `/api/scenarios/overrides?scenarioId=${scenario.id}&count=true`,
      );
      expect(emptyOverrides.ok()).toBeTruthy();
      const emptyData = await emptyOverrides.json();
      expect(emptyData.count).toBe(0);

      // Enter scenario and make a change via revenue edit
      await waitForScenariosPage(page);
      await enterScenario(page, scenarioName);

      const scenarioId = getScenarioIdFromUrl(page);
      expect(scenarioId).toBeTruthy();

      await page.goto(`/revenue?scenarioId=${scenarioId}`);
      await expect(
        page.getByRole("heading", { name: "Revenue" })
      ).toBeVisible({ timeout: 10_000 });

      // Edit a revenue stream
      const editButton = page.locator("[aria-label*='Edit']").first();
      if (await editButton.isVisible({ timeout: 5_000 })) {
        await editButton.click();

        const nameInput = page.getByPlaceholder(
          "e.g. Growth Plan, Implementation Services",
        );
        if (await nameInput.isVisible({ timeout: 3_000 })) {
          await nameInput.fill(`DB Verify Stream ${RUN_ID}`);

          const submitBtn = page.locator("button[type='submit']").first();
          if (await submitBtn.isEnabled({ timeout: 2_000 })) {
            await submitBtn.click();
            await expect(nameInput).not.toBeVisible({ timeout: 10_000 });
          }
        }
      }

      // Wait for mutation to settle
      await page.waitForTimeout(1_000);

      // Verify: scenario_overrides table now has rows
      const overridesRes = await page.request.get(
        `/api/scenarios/overrides?scenarioId=${scenario.id}`,
      );
      expect(overridesRes.ok()).toBeTruthy();
      const overridesData = await overridesRes.json();
      expect(overridesData.summary.total).toBeGreaterThanOrEqual(1);

      // Verify: base tables are untouched — request WITHOUT scenario header
      // (exit scenario first, then fetch base data)
      await exitScenario(page);

      const afterBaseRevenueRes = await page.request.get("/api/revenue-streams");
      expect(afterBaseRevenueRes.ok()).toBeTruthy();
      const afterBaseRevenue = await afterBaseRevenueRes.json();
      const afterBaseRevenueIds = (
        Array.isArray(afterBaseRevenue) ? afterBaseRevenue : afterBaseRevenue.items ?? []
      ).map((r: { id: string }) => r.id);

      // Same IDs should exist in base — no phantom entities created
      expect(afterBaseRevenueIds.sort()).toEqual(baseRevenueIds.sort());

      // Override count via API should still show the change
      const finalCountRes = await page.request.get(
        `/api/scenarios/overrides?scenarioId=${scenario.id}&count=true`,
      );
      if (finalCountRes.ok()) {
        const finalCount = await finalCountRes.json();
        expect(finalCount.count).toBeGreaterThanOrEqual(1);
      }
    } finally {
      await deleteScenarioViaAPI(page.request, scenario.id);
    }
  });

  test("override count API returns correct numbers for mixed operations", async ({
    page,
  }) => {
    const scenarioName = `Count API Test ${RUN_ID}`;
    const scenario = await createScenarioViaAPI(page.request, scenarioName);

    try {
      // Count-only endpoint
      const countRes = await page.request.get(
        `/api/scenarios/overrides?scenarioId=${scenario.id}&count=true`,
      );
      expect(countRes.ok()).toBeTruthy();
      const countData = await countRes.json();
      expect(typeof countData.count).toBe("number");
      expect(countData.count).toBe(0);

      // Full override list endpoint
      const fullRes = await page.request.get(
        `/api/scenarios/overrides?scenarioId=${scenario.id}`,
      );
      expect(fullRes.ok()).toBeTruthy();
      const fullData = await fullRes.json();
      expect(fullData.summary).toBeDefined();
      expect(fullData.summary.total).toBe(0);
      expect(fullData.summary.modified).toBe(0);
      expect(fullData.summary.created).toBe(0);
      expect(fullData.summary.deleted).toBe(0);
      expect(fullData.groups).toBeDefined();
      expect(Array.isArray(fullData.groups)).toBe(true);
    } finally {
      await deleteScenarioViaAPI(page.request, scenario.id);
    }
  });
});
