import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * Scenario Data Isolation E2E Tests — BUR-271
 *
 * Updated for the overlay scenario system. In the overlay model:
 * - Forecast lines, revenue streams, headcount plans are company-scoped (base data)
 * - Scenarios hold overrides, not copies of data
 * - Isolation means: creating/editing/deleting scenarios doesn't corrupt base data
 *
 * Seeded IDs:
 *   - Base Case:  00000000-0000-4000-a000-000000000200
 *   - Best Case:  00000000-0000-4000-a000-000000000201
 *   - Worst Case: 00000000-0000-4000-a000-000000000202
 */

const dbAvailable = !!process.env.DATABASE_URL;

const SEEDED = {
  scenarioBase: "00000000-0000-4000-a000-000000000200",
  scenarioBest: "00000000-0000-4000-a000-000000000201",
  scenarioWorst: "00000000-0000-4000-a000-000000000202",
};

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Fetch all scenarios for the authenticated company */
async function getScenarios(request: APIRequestContext) {
  const res = await request.get("/api/scenarios");
  expect(res.status(), "GET /api/scenarios should return 200").toBe(200);
  return res.json() as Promise<Array<{ id: string; name: string; source: string; status: string }>>;
}

/** Fetch a single scenario by ID */
async function getScenario(request: APIRequestContext, scenarioId: string) {
  const res = await request.get(`/api/scenarios/${scenarioId}`);
  return { status: res.status(), data: res.status() === 200 ? await res.json() : null };
}

/** Create a new scenario */
async function createScenario(request: APIRequestContext, name: string) {
  const res = await request.post("/api/scenarios", {
    data: { name, description: `E2E isolation test: ${name}` },
  });
  expect(res.status(), `POST /api/scenarios should return 201 for "${name}"`).toBe(201);
  return res.json() as Promise<{ id: string; name: string; source: string }>;
}

/** Delete a scenario by ID */
async function deleteScenario(request: APIRequestContext, scenarioId: string) {
  const res = await request.delete(`/api/scenarios/${scenarioId}`);
  return res.status();
}

/** Snapshot of base scenario for comparison */
interface ScenarioSnapshot {
  id: string;
  name: string;
  source: string;
  status: string;
}

async function snapshotScenario(request: APIRequestContext, id: string): Promise<ScenarioSnapshot> {
  const result = await getScenario(request, id);
  expect(result.status, "Scenario should exist").toBe(200);
  return result.data;
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Scenario CRUD Isolation
// ═════════════════════════════════════════════════════════════════════════════

test.describe("Scenario CRUD isolation — API verification", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL for authenticated API tests");
  test.use({ storageState: "e2e/.auth/user.json" });

  // ── 1. Create scenario → verify other scenarios unchanged ─────────────
  test("creating a new scenario does not affect existing scenarios", async ({ request }) => {
    const before = await snapshotScenario(request, SEEDED.scenarioBase);

    const newScenario = await createScenario(request, `Isolation Test ${Date.now()}`);

    const after = await snapshotScenario(request, SEEDED.scenarioBase);
    expect(after.id).toBe(before.id);
    expect(after.name).toBe(before.name);
    expect(after.source).toBe(before.source);

    // Cleanup
    await deleteScenario(request, newScenario.id);
  });

  // ── 2. Edit scenario → verify other scenarios unchanged ────────────────
  test("editing a scenario name does not affect other scenarios", async ({ request }) => {
    const before = await snapshotScenario(request, SEEDED.scenarioBase);

    const testScenario = await createScenario(request, `Edit Test ${Date.now()}`);
    const patchRes = await request.patch(`/api/scenarios/${testScenario.id}`, {
      data: { name: "Renamed Scenario" },
    });
    expect(patchRes.status(), "PATCH scenario should return 200").toBe(200);

    const after = await snapshotScenario(request, SEEDED.scenarioBase);
    expect(after.name).toBe(before.name);

    // Cleanup
    await deleteScenario(request, testScenario.id);
  });

  // ── 3. Delete scenario → verify other scenarios unchanged ─────────────
  test("deleting a scenario does not affect other scenarios", async ({ request }) => {
    const testScenario = await createScenario(request, `Delete Test ${Date.now()}`);
    const before = await snapshotScenario(request, SEEDED.scenarioBase);

    const deleteStatus = await deleteScenario(request, testScenario.id);
    expect(deleteStatus, "DELETE scenario should return 200").toBe(200);

    const getResult = await getScenario(request, testScenario.id);
    expect(getResult.status, "Deleted scenario should return 404").toBe(404);

    const after = await snapshotScenario(request, SEEDED.scenarioBase);
    expect(after.id).toBe(before.id);
    expect(after.name).toBe(before.name);
  });

  // ── 4. Rapid create-edit-delete cycle → other scenarios stay clean ────
  test("rapid create-edit-delete cycle does not corrupt other scenarios", async ({ request }) => {
    const before = await snapshotScenario(request, SEEDED.scenarioBase);

    const s1 = await createScenario(request, `Rapid-1-${Date.now()}`);
    const s2 = await createScenario(request, `Rapid-2-${Date.now()}`);
    const s3 = await createScenario(request, `Rapid-3-${Date.now()}`);

    await request.patch(`/api/scenarios/${s1.id}`, { data: { name: "Rapid Modified 1" } });
    await request.patch(`/api/scenarios/${s2.id}`, { data: { description: "Modified description" } });
    await deleteScenario(request, s2.id);

    const after = await snapshotScenario(request, SEEDED.scenarioBase);
    expect(after.id).toBe(before.id);
    expect(after.name).toBe(before.name);

    // Cleanup
    await deleteScenario(request, s1.id);
    await deleteScenario(request, s3.id);
  });

  // ── 5. Scenario list includes all seeded scenarios ─────────────────────
  test("scenario list returns all seeded scenarios", async ({ request }) => {
    const scenarios = await getScenarios(request);
    const ids = scenarios.map((s) => s.id);
    expect(ids).toContain(SEEDED.scenarioBase);
    expect(ids).toContain(SEEDED.scenarioBest);
    expect(ids).toContain(SEEDED.scenarioWorst);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TEST SUITE: UI-level scenario visibility
// ═════════════════════════════════════════════════════════════════════════════

test.describe("Scenario isolation — UI verification", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL for authenticated UI tests");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("scenarios page shows all seeded scenarios with correct names", async ({ page }) => {
    await page.goto("/scenarios");
    await expect(page.getByRole("heading", { name: "Scenarios" })).toBeVisible({ timeout: 10_000 });

    await expect(page.getByText("Base Case").first()).toBeVisible();
    await expect(page.getByText("Best Case").first()).toBeVisible();
    await expect(page.getByText("Worst Case").first()).toBeVisible();
  });
});
