import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * Scenario Data Isolation E2E Tests — BUR-271
 *
 * Validates the CRITICAL invariant: base data and other scenarios must NEVER be
 * affected by operations on a different scenario. Tests use the seeded demo
 * company (demo@burnless.app) and verify isolation via API after every operation.
 *
 * Seeded IDs:
 *   - Base Case:  00000000-0000-4000-a000-000000000200
 *   - Best Case:  00000000-0000-4000-a000-000000000201
 *   - Worst Case: 00000000-0000-4000-a000-000000000202
 *   - Base forecast lines: 5 (office rent, marketing growth, cloud, payment, software)
 *   - Best/Worst forecast lines: 1 each
 *   - Revenue streams: 4 (all in base)
 *   - Headcount plans: 6 (all in base)
 */

const dbAvailable = !!process.env.DATABASE_URL;

const SEEDED = {
  scenarioBase: "00000000-0000-4000-a000-000000000200",
  scenarioBest: "00000000-0000-4000-a000-000000000201",
  scenarioWorst: "00000000-0000-4000-a000-000000000202",
  baseForecastLineCount: 5,
  bestForecastLineCount: 1,
  worstForecastLineCount: 1,
  revenueStreamCount: 4, // all in base scenario
  headcountPlanCount: 6, // all in base scenario
};

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Fetch all scenarios for the authenticated company */
async function getScenarios(request: APIRequestContext) {
  const res = await request.get("/api/scenarios");
  expect(res.status(), "GET /api/scenarios should return 200").toBe(200);
  return res.json() as Promise<Array<{ id: string; name: string; type: string; isDefault: boolean }>>;
}

/** Fetch forecast lines for a given scenario */
async function getForecastLines(request: APIRequestContext, scenarioId: string) {
  const res = await request.get(`/api/forecast-lines?scenarioId=${scenarioId}&limit=100`);
  expect(res.status(), `GET forecast-lines for ${scenarioId} should return 200`).toBe(200);
  const body = await res.json();
  return body.data as Array<{ id: string; scenarioId: string; accountId: string; method: string }>;
}

/** Fetch a single scenario by ID */
async function getScenario(request: APIRequestContext, scenarioId: string) {
  const res = await request.get(`/api/scenarios/${scenarioId}`);
  return { status: res.status(), data: res.status() === 200 ? await res.json() : null };
}

/** Create a new custom scenario */
async function createScenario(request: APIRequestContext, name: string) {
  const res = await request.post("/api/scenarios", {
    data: { name, type: "custom", description: `E2E isolation test: ${name}` },
  });
  expect(res.status(), `POST /api/scenarios should return 201 for "${name}"`).toBe(201);
  return res.json() as Promise<{ id: string; name: string; type: string }>;
}

/** Delete a scenario by ID */
async function deleteScenario(request: APIRequestContext, scenarioId: string) {
  const res = await request.delete(`/api/scenarios/${scenarioId}`);
  return res.status();
}

/** Snapshot of base scenario data for comparison */
interface BaseSnapshot {
  scenario: { id: string; name: string; type: string; isDefault: boolean };
  forecastLines: Array<{ id: string; scenarioId: string; accountId: string; method: string }>;
}

async function snapshotBase(request: APIRequestContext): Promise<BaseSnapshot> {
  const scenario = await getScenario(request, SEEDED.scenarioBase);
  expect(scenario.status, "Base scenario should exist").toBe(200);
  const forecastLines = await getForecastLines(request, SEEDED.scenarioBase);
  return { scenario: scenario.data, forecastLines };
}

/** Assert that base scenario data matches a previous snapshot */
function assertBaseUnchanged(before: BaseSnapshot, after: BaseSnapshot, operation: string) {
  // Scenario metadata unchanged
  expect(after.scenario.id, `${operation}: base scenario ID unchanged`).toBe(before.scenario.id);
  expect(after.scenario.name, `${operation}: base scenario name unchanged`).toBe(before.scenario.name);
  expect(after.scenario.type, `${operation}: base scenario type unchanged`).toBe(before.scenario.type);
  expect(after.scenario.isDefault, `${operation}: base scenario isDefault unchanged`).toBe(before.scenario.isDefault);

  // Forecast line count unchanged
  expect(
    after.forecastLines.length,
    `${operation}: base forecast line count should be ${before.forecastLines.length}, got ${after.forecastLines.length}`
  ).toBe(before.forecastLines.length);

  // Every forecast line ID still present
  const beforeIds = new Set(before.forecastLines.map((fl) => fl.id));
  const afterIds = new Set(after.forecastLines.map((fl) => fl.id));
  for (const id of beforeIds) {
    expect(afterIds.has(id), `${operation}: base forecast line ${id} should still exist`).toBe(true);
  }

  // Methods unchanged
  const beforeMethods = new Map(before.forecastLines.map((fl) => [fl.id, fl.method]));
  for (const fl of after.forecastLines) {
    expect(fl.method, `${operation}: forecast line ${fl.id} method unchanged`).toBe(beforeMethods.get(fl.id));
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Scenario Data Isolation
// ═════════════════════════════════════════════════════════════════════════════

test.describe("Scenario data isolation — API verification", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL for authenticated API tests");
  test.use({ storageState: "e2e/.auth/user.json" });

  // ── 1. Create scenario → verify base data unchanged ─────────────────────
  test("creating a new scenario does not affect base scenario data", async ({ request }) => {
    const before = await snapshotBase(request);

    // Create a custom scenario
    const newScenario = await createScenario(request, `Isolation Test ${Date.now()}`);

    // Verify base data unchanged
    const after = await snapshotBase(request);
    assertBaseUnchanged(before, after, "create scenario");

    // New scenario should have zero forecast lines (it's a fresh custom scenario)
    const newForecastLines = await getForecastLines(request, newScenario.id);
    expect(
      newForecastLines.length,
      "New custom scenario should start with 0 forecast lines"
    ).toBe(0);

    // Cleanup
    await deleteScenario(request, newScenario.id);
  });

  // ── 2. Edit scenario values → verify base data unchanged ────────────────
  test("editing a scenario name does not affect base scenario data", async ({ request }) => {
    const before = await snapshotBase(request);

    // Create and then modify a scenario
    const testScenario = await createScenario(request, `Edit Test ${Date.now()}`);

    // Rename it
    const patchRes = await request.patch(`/api/scenarios/${testScenario.id}`, {
      data: { name: "Renamed Scenario" },
    });
    expect(patchRes.status(), "PATCH scenario should return 200").toBe(200);

    // Verify base is untouched
    const after = await snapshotBase(request);
    assertBaseUnchanged(before, after, "edit scenario name");

    // Cleanup
    await deleteScenario(request, testScenario.id);
  });

  // ── 3. Delete scenario → verify base data unchanged ─────────────────────
  test("deleting a scenario does not affect base scenario data", async ({ request }) => {
    // Create a scenario first
    const testScenario = await createScenario(request, `Delete Test ${Date.now()}`);

    // Snapshot base AFTER creation (so we know creation didn't corrupt it)
    const before = await snapshotBase(request);

    // Delete the test scenario
    const deleteStatus = await deleteScenario(request, testScenario.id);
    expect(deleteStatus, "DELETE scenario should return 200").toBe(200);

    // Confirm it's gone
    const getResult = await getScenario(request, testScenario.id);
    expect(getResult.status, "Deleted scenario should return 404").toBe(404);

    // Verify base data unchanged
    const after = await snapshotBase(request);
    assertBaseUnchanged(before, after, "delete scenario");
  });

  // ── 4. Switch between scenarios → verify values correct per scenario ────
  test("each scenario returns its own forecast lines, not another's", async ({ request }) => {
    const baseForecastLines = await getForecastLines(request, SEEDED.scenarioBase);
    const bestForecastLines = await getForecastLines(request, SEEDED.scenarioBest);
    const worstForecastLines = await getForecastLines(request, SEEDED.scenarioWorst);

    // Each scenario should have distinct forecast lines
    expect(baseForecastLines.length, "Base should have 5 forecast lines").toBe(SEEDED.baseForecastLineCount);
    expect(bestForecastLines.length, "Best should have 1 forecast line").toBe(SEEDED.bestForecastLineCount);
    expect(worstForecastLines.length, "Worst should have 1 forecast line").toBe(SEEDED.worstForecastLineCount);

    // Every forecast line in base must have scenarioId = base
    for (const fl of baseForecastLines) {
      expect(fl.scenarioId, `Base forecast line ${fl.id} must belong to base scenario`).toBe(SEEDED.scenarioBase);
    }

    // Every forecast line in best must have scenarioId = best
    for (const fl of bestForecastLines) {
      expect(fl.scenarioId, `Best forecast line ${fl.id} must belong to best scenario`).toBe(SEEDED.scenarioBest);
    }

    // Every forecast line in worst must have scenarioId = worst
    for (const fl of worstForecastLines) {
      expect(fl.scenarioId, `Worst forecast line ${fl.id} must belong to worst scenario`).toBe(SEEDED.scenarioWorst);
    }

    // No ID overlap between scenarios
    const baseIds = new Set(baseForecastLines.map((fl) => fl.id));
    const bestIds = new Set(bestForecastLines.map((fl) => fl.id));
    const worstIds = new Set(worstForecastLines.map((fl) => fl.id));

    for (const id of bestIds) {
      expect(baseIds.has(id), `Best forecast line ${id} should NOT appear in base`).toBe(false);
    }
    for (const id of worstIds) {
      expect(baseIds.has(id), `Worst forecast line ${id} should NOT appear in base`).toBe(false);
      expect(bestIds.has(id), `Worst forecast line ${id} should NOT appear in best`).toBe(false);
    }
  });

  // ── 5. Create scenario → verify it's a copy, not a reference ────────────
  test("new scenario with forecast line is independent from base", async ({ request }) => {
    const testScenario = await createScenario(request, `Copy Test ${Date.now()}`);

    // Add a forecast line to the new scenario
    const createFLRes = await request.post("/api/forecast-lines", {
      data: {
        scenarioId: testScenario.id,
        accountId: "00000000-0000-4000-a000-000000000122", // acctOffice
        method: "fixed",
        parameters: { amount: 99999 },
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      },
    });
    expect(createFLRes.status(), "POST forecast-line should return 201").toBe(201);

    // The new scenario should have 1 forecast line
    const testFL = await getForecastLines(request, testScenario.id);
    expect(testFL.length, "Test scenario should have 1 forecast line").toBe(1);
    expect(testFL[0]!.scenarioId).toBe(testScenario.id);

    // Base scenario should still have its original count (not +1)
    const baseFL = await getForecastLines(request, SEEDED.scenarioBase);
    expect(
      baseFL.length,
      `Base should still have ${SEEDED.baseForecastLineCount} forecast lines, not ${baseFL.length}`
    ).toBe(SEEDED.baseForecastLineCount);

    // None of the base forecast lines should reference the new scenario
    for (const fl of baseFL) {
      expect(fl.scenarioId).toBe(SEEDED.scenarioBase);
    }

    // Cleanup
    await deleteScenario(request, testScenario.id);
  });

  // ── 6. Modify forecast line in new scenario → base forecast unchanged ───
  test("modifying forecast line in one scenario does not affect another", async ({ request }) => {
    const testScenario = await createScenario(request, `Modify FL Test ${Date.now()}`);

    // Add a forecast line to test scenario
    const createRes = await request.post("/api/forecast-lines", {
      data: {
        scenarioId: testScenario.id,
        accountId: "00000000-0000-4000-a000-000000000121", // acctMarketing
        method: "fixed",
        parameters: { amount: 50000 },
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      },
    });
    expect(createRes.status()).toBe(201);
    const createdFL = await createRes.json();

    // Snapshot base before modification
    const baseBefore = await getForecastLines(request, SEEDED.scenarioBase);

    // Modify the forecast line in the test scenario
    const patchRes = await request.patch(`/api/forecast-lines/${createdFL.id}`, {
      data: { parameters: { amount: 99999 } },
    });
    expect(patchRes.status(), "PATCH forecast line should return 200").toBe(200);

    // Base forecast lines should be completely unchanged
    const baseAfter = await getForecastLines(request, SEEDED.scenarioBase);
    expect(baseAfter.length).toBe(baseBefore.length);

    for (const before of baseBefore) {
      const after = baseAfter.find((fl) => fl.id === before.id);
      expect(after, `Base forecast line ${before.id} should still exist`).toBeTruthy();
      expect(after!.method).toBe(before.method);
      expect(after!.accountId).toBe(before.accountId);
    }

    // Cleanup
    await deleteScenario(request, testScenario.id);
  });

  // ── 7. Delete forecast line from one scenario → other scenarios intact ──
  test("deleting forecast line from one scenario leaves others intact", async ({ request }) => {
    const testScenario = await createScenario(request, `Delete FL Test ${Date.now()}`);

    // Add a forecast line
    const createRes = await request.post("/api/forecast-lines", {
      data: {
        scenarioId: testScenario.id,
        accountId: "00000000-0000-4000-a000-000000000123", // acctSoftwareTools
        method: "fixed",
        parameters: { amount: 3000 },
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      },
    });
    const createdFL = await createRes.json();

    // Snapshot all scenarios before deletion
    const baseBefore = await getForecastLines(request, SEEDED.scenarioBase);
    const bestBefore = await getForecastLines(request, SEEDED.scenarioBest);
    const worstBefore = await getForecastLines(request, SEEDED.scenarioWorst);

    // Delete the forecast line from test scenario
    const deleteRes = await request.delete(`/api/forecast-lines/${createdFL.id}`);
    expect(deleteRes.status(), "DELETE forecast line should return 200").toBe(200);

    // All other scenarios should be unchanged
    const baseAfter = await getForecastLines(request, SEEDED.scenarioBase);
    const bestAfter = await getForecastLines(request, SEEDED.scenarioBest);
    const worstAfter = await getForecastLines(request, SEEDED.scenarioWorst);

    expect(baseAfter.length, "Base forecast lines count unchanged").toBe(baseBefore.length);
    expect(bestAfter.length, "Best forecast lines count unchanged").toBe(bestBefore.length);
    expect(worstAfter.length, "Worst forecast lines count unchanged").toBe(worstBefore.length);

    // Cleanup
    await deleteScenario(request, testScenario.id);
  });

  // ── 8. Scenario cascade delete removes only that scenario's data ────────
  test("cascade delete removes only the deleted scenario's forecast lines", async ({ request }) => {
    // Create scenario with forecast line
    const testScenario = await createScenario(request, `Cascade Test ${Date.now()}`);
    await request.post("/api/forecast-lines", {
      data: {
        scenarioId: testScenario.id,
        accountId: "00000000-0000-4000-a000-000000000124", // acctTravel
        method: "fixed",
        parameters: { amount: 2000 },
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      },
    });

    // Confirm it has data
    const flBefore = await getForecastLines(request, testScenario.id);
    expect(flBefore.length, "Test scenario should have 1 forecast line before cascade").toBe(1);

    // Snapshot base
    const baseBefore = await snapshotBase(request);

    // Delete scenario (should cascade to forecast lines)
    await deleteScenario(request, testScenario.id);

    // Base should be completely unchanged
    const baseAfter = await snapshotBase(request);
    assertBaseUnchanged(baseBefore, baseAfter, "cascade delete");

    // Seeded best/worst should still have their data
    const bestFL = await getForecastLines(request, SEEDED.scenarioBest);
    const worstFL = await getForecastLines(request, SEEDED.scenarioWorst);
    expect(bestFL.length).toBe(SEEDED.bestForecastLineCount);
    expect(worstFL.length).toBe(SEEDED.worstForecastLineCount);
  });

  // ── 9. Multiple rapid scenario operations → base stays clean ────────────
  test("rapid create-edit-delete cycle does not corrupt base data", async ({ request }) => {
    const baseBefore = await snapshotBase(request);

    // Create 3 scenarios rapidly
    const s1 = await createScenario(request, `Rapid-1-${Date.now()}`);
    const s2 = await createScenario(request, `Rapid-2-${Date.now()}`);
    const s3 = await createScenario(request, `Rapid-3-${Date.now()}`);

    // Modify them
    await request.patch(`/api/scenarios/${s1.id}`, { data: { name: "Rapid Modified 1" } });
    await request.patch(`/api/scenarios/${s2.id}`, { data: { description: "Modified description" } });

    // Delete one in the middle
    await deleteScenario(request, s2.id);

    // Verify base unchanged
    const baseAfter = await snapshotBase(request);
    assertBaseUnchanged(baseBefore, baseAfter, "rapid create-edit-delete cycle");

    // Cleanup remaining
    await deleteScenario(request, s1.id);
    await deleteScenario(request, s3.id);
  });

  // ── 10. Scenario compare returns correct data per scenario ──────────────
  test("scenario comparison returns distinct data for each scenario", async ({ request }) => {
    const res = await request.get(
      `/api/scenarios/compare?baseId=${SEEDED.scenarioBase}&compareId=${SEEDED.scenarioBest}`
    );
    expect(res.status(), "Scenario compare should return 200").toBe(200);

    const comparison = await res.json();

    // Comparison should have both scenario names
    expect(comparison.baseScenario).toBeTruthy();
    expect(comparison.compareScenario).toBeTruthy();
    expect(comparison.baseScenario).not.toBe(comparison.compareScenario);

    // Each line should have base and compare values as separate arrays
    for (const key of ["revenue", "expenses", "netIncome", "cashPosition", "headcount"] as const) {
      const line = comparison[key];
      expect(line, `Comparison should include ${key}`).toBeTruthy();
      expect(Array.isArray(line.baseValues), `${key}.baseValues should be array`).toBe(true);
      expect(Array.isArray(line.compareValues), `${key}.compareValues should be array`).toBe(true);
      expect(Array.isArray(line.deltaAbsolute), `${key}.deltaAbsolute should be array`).toBe(true);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TEST SUITE: UI-level scenario isolation
// ═════════════════════════════════════════════════════════════════════════════

test.describe("Scenario isolation — UI verification", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL for authenticated UI tests");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("scenarios page shows all seeded scenarios with correct names", async ({ page }) => {
    await page.goto("/scenarios");
    await expect(page.getByRole("heading", { name: "Scenarios" })).toBeVisible({ timeout: 10_000 });

    // All 3 seeded scenarios should be visible
    await expect(page.getByText("Base Case").first()).toBeVisible();
    await expect(page.getByText("Best Case").first()).toBeVisible();
    await expect(page.getByText("Worst Case").first()).toBeVisible();
  });

  test("creating scenario via UI does not remove existing scenarios from list", async ({ page, request }) => {
    // Count scenarios via API before
    const before = await getScenarios(request);
    const countBefore = before.length;

    // Navigate to scenarios page
    await page.goto("/scenarios");
    await expect(page.getByRole("heading", { name: "Scenarios" })).toBeVisible({ timeout: 10_000 });

    // Create a new scenario via the UI
    await page.getByRole("button", { name: /new scenario|create scenario/i }).click();
    await page.locator("button").filter({ hasText: "Lean Operations" }).click();

    // Wait for redirect to scenario detail
    await expect(page).toHaveURL(/\/scenarios\//, { timeout: 15_000 });

    // Go back to scenarios list
    await page.goto("/scenarios");
    await expect(page.getByRole("heading", { name: "Scenarios" })).toBeVisible({ timeout: 10_000 });

    // All original scenarios should still be visible
    await expect(page.getByText("Base Case").first()).toBeVisible();
    await expect(page.getByText("Best Case").first()).toBeVisible();
    await expect(page.getByText("Worst Case").first()).toBeVisible();

    // Count should have increased by 1
    const after = await getScenarios(request);
    expect(after.length, "Scenario count should increase by 1 after creation").toBe(countBefore + 1);

    // Cleanup: delete the newly created scenario (find the one that wasn't there before)
    const beforeIds = new Set(before.map((s) => s.id));
    const newScenario = after.find((s) => !beforeIds.has(s.id));
    if (newScenario) {
      await deleteScenario(request, newScenario.id);
    }
  });

  test("seeded base scenario detail page loads without errors", async ({ page }) => {
    const res = await page.goto(`/scenarios/${SEEDED.scenarioBase}`);
    expect(res?.status(), "Base scenario detail should not return 500").toBeLessThan(500);

    // Wait for content to load
    await page.waitForLoadState("networkidle");

    // Should show scenario content (not an error page)
    const bodyText = await page.textContent("body");
    expect(bodyText, "Page should not show 'not found' error").not.toContain("404");
  });

  test("navigating between scenario detail pages shows different data", async ({ page }) => {
    // Load base scenario
    await page.goto(`/scenarios/${SEEDED.scenarioBase}`);
    await page.waitForLoadState("networkidle");
    const baseContent = await page.textContent("body");

    // Load best scenario
    await page.goto(`/scenarios/${SEEDED.scenarioBest}`);
    await page.waitForLoadState("networkidle");
    const bestContent = await page.textContent("body");

    // They should render different content (at minimum, different names)
    expect(baseContent).toContain("Base Case");
    expect(bestContent).toContain("Best Case");
  });
});
