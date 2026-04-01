import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

/**
 * Scenario Comparison E2E Tests — Task 22
 *
 * Tests the comparison view:
 *   1. Compare scenario vs base — select sides, verify metrics and data diff tabs
 *   2. Compare scenario vs scenario — two different scenarios side by side
 */

const dbAvailable = !!process.env.DATABASE_URL;
const RUN_ID = Date.now();

// ── Helpers ─────────────────────────────────────────────────────────────────

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

async function deleteScenarioViaAPI(request: APIRequestContext, id: string) {
  await request.delete(`/api/scenarios/${id}`);
}

/** Modify the first revenue stream inside a scenario via API */
async function modifyRevenueInScenario(
  request: APIRequestContext,
  scenarioId: string,
  nameSuffix: string,
): Promise<{ streamId: string; originalName: string }> {
  const streamsRes = await request.get("/api/revenue-streams");
  expect(streamsRes.ok()).toBeTruthy();
  const streams = await streamsRes.json();
  const streamList = Array.isArray(streams) ? streams : streams.items ?? [];

  if (streamList.length === 0) {
    throw new Error("No revenue streams found — seed data required");
  }

  const stream = streamList[0];
  const patchRes = await request.patch(`/api/revenue-streams/${stream.id}`, {
    data: { name: `${stream.name} ${nameSuffix}` },
    headers: { "X-Scenario-Id": scenarioId },
  });
  expect(patchRes.ok()).toBeTruthy();

  return { streamId: stream.id, originalName: stream.name };
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST 1: Compare scenario vs base
// ═════════════════════════════════════════════════════════════════════════════

test.describe("Scenario Comparison — vs Base", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("compare scenario against base shows metric charts and data diff", async ({ page }) => {
    const scenarioName = `Compare Base Test ${RUN_ID}`;
    const scenario = await createScenarioViaAPI(page.request, scenarioName);

    try {
      // Create a change in the scenario
      await modifyRevenueInScenario(page.request, scenario.id, `(cmp-base-${RUN_ID})`);

      // Navigate to comparison page with base on left, scenario on right
      await page.goto(`/scenarios/compare?ids=base,${scenario.id}`);
      await expect(
        page.getByRole("heading", { name: "Compare Scenarios" })
      ).toBeVisible({ timeout: 15_000 });

      // Verify scenario selectors are present
      await expect(
        page.getByText("Base scenario")
      ).toBeVisible({ timeout: 5_000 });
      await expect(
        page.getByText("Compare with")
      ).toBeVisible({ timeout: 5_000 });

      // Wait for comparison data to load (metric summary cards should appear)
      // The API compare endpoint returns 5 lines: Revenue, Expenses, Net Income, Cash Position, Headcount
      await expect(
        page.getByText("Revenue").first()
      ).toBeVisible({ timeout: 15_000 });

      // Verify Metric Impact tab is active by default
      const metricBtn = page.getByRole("button", { name: "Metric Impact" });
      await expect(metricBtn).toBeVisible({ timeout: 5_000 });

      // Verify at least some metric card content shows (scenario names in the cards)
      await expect(
        page.getByText("Base (current plan)").first()
      ).toBeVisible({ timeout: 10_000 });

      // Verify Monthly Breakdown table exists
      await expect(
        page.getByText("Monthly Breakdown")
      ).toBeVisible({ timeout: 10_000 });

      // Switch to Data Changes tab
      const dataBtn = page.getByRole("button", { name: "Data Changes" });
      await expect(dataBtn).toBeVisible();
      await dataBtn.click();

      // The data diff should show entity-level diffs
      // Since we modified a revenue stream, the Revenue Streams section should appear
      await expect(
        page.getByText("Revenue Streams").first()
      ).toBeVisible({ timeout: 10_000 });

      // There should be a Modified badge for the changed stream
      await expect(
        page.getByText("Modified").first()
      ).toBeVisible({ timeout: 5_000 });

      // Verify the API response shape directly
      const apiRes = await page.request.get(
        `/api/scenarios/compare?baseId=base&compareId=${scenario.id}`,
      );
      expect(apiRes.ok()).toBeTruthy();
      const apiData = await apiRes.json();
      expect(apiData.lines).toBeDefined();
      expect(apiData.lines.length).toBe(5);
      expect(apiData.dataDiff).toBeDefined();
      expect(apiData.dataDiff.summary.total).toBeGreaterThanOrEqual(1);
    } finally {
      await deleteScenarioViaAPI(page.request, scenario.id);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TEST 2: Compare scenario vs scenario
// ═════════════════════════════════════════════════════════════════════════════

test.describe("Scenario Comparison — vs Scenario", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("compare two scenarios with different changes shows both tabs", async ({ page }) => {
    const scenarioNameA = `Compare A ${RUN_ID}`;
    const scenarioNameB = `Compare B ${RUN_ID}`;
    const scenarioA = await createScenarioViaAPI(page.request, scenarioNameA);
    const scenarioB = await createScenarioViaAPI(page.request, scenarioNameB);

    try {
      // Create different overrides in each scenario
      await modifyRevenueInScenario(page.request, scenarioA.id, `(cmpA-${RUN_ID})`);
      await modifyRevenueInScenario(page.request, scenarioB.id, `(cmpB-${RUN_ID})`);

      // Navigate to comparison page with scenario A on left, scenario B on right
      await page.goto(`/scenarios/compare?ids=${scenarioA.id},${scenarioB.id}`);
      await expect(
        page.getByRole("heading", { name: "Compare Scenarios" })
      ).toBeVisible({ timeout: 15_000 });

      // Wait for comparison data to load
      await expect(
        page.getByText("Revenue").first()
      ).toBeVisible({ timeout: 15_000 });

      // Verify both scenario names appear in metric cards
      await expect(
        page.getByText(scenarioNameA).first()
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        page.getByText(scenarioNameB).first()
      ).toBeVisible({ timeout: 10_000 });

      // Verify Monthly Breakdown table is present
      await expect(
        page.getByText("Monthly Breakdown")
      ).toBeVisible({ timeout: 10_000 });

      // Switch to Data Changes tab
      const dataBtn = page.getByRole("button", { name: "Data Changes" });
      await dataBtn.click();

      // Both scenarios modified the same stream differently, so the diff should show it
      // The data diff shows modifications between scenario A and B
      await expect(
        page.getByText("Revenue Streams").first()
      ).toBeVisible({ timeout: 10_000 });

      // Verify the API compare response for scenario vs scenario
      const apiRes = await page.request.get(
        `/api/scenarios/compare?baseId=${scenarioA.id}&compareId=${scenarioB.id}`,
      );
      expect(apiRes.ok()).toBeTruthy();
      const apiData = await apiRes.json();

      // Verify the structure
      expect(apiData.baseScenario).toBeDefined();
      expect(apiData.compareScenario).toBeDefined();
      expect(apiData.baseScenario.name).toBe(scenarioNameA);
      expect(apiData.compareScenario.name).toBe(scenarioNameB);
      expect(apiData.lines).toHaveLength(5);
      expect(apiData.dataDiff).toBeDefined();

      // Since both scenarios modified the same stream differently, there should be diffs
      expect(apiData.dataDiff.summary.total).toBeGreaterThanOrEqual(1);
    } finally {
      await deleteScenarioViaAPI(page.request, scenarioA.id);
      await deleteScenarioViaAPI(page.request, scenarioB.id);
    }
  });
});
