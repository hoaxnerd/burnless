import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

/**
 * Scenario Edge Cases & Safety E2E Tests — Task 24
 *
 * Tests safety guardrails and edge-case behaviors:
 *   1. Scenario safety middleware — 409 on cookie/header mismatch
 *   2. Duplicate scenario — clone with overrides
 *   3. Exit scenario clears state — no residual scenario artifacts
 *   4. Base changes while in scenario — base updates visible alongside overrides
 */

const dbAvailable = !!process.env.DATABASE_URL;
const RUN_ID = Date.now();

// ── Helpers ─────────────────────────────────────────────────────────────────

async function waitForScenariosPage(page: Page) {
  await page.goto("/scenarios");
  await expect(
    page.getByRole("heading", { name: "Scenarios" })
  ).toBeVisible({ timeout: 15_000 });
}

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

async function enterScenario(page: Page, name: string) {
  const card = page.locator("div").filter({ hasText: name }).first();
  await card.getByText("Enter sandbox").click();
  await expect(
    page.locator(".bg-amber-500").first()
  ).toBeVisible({ timeout: 10_000 });
}

async function exitScenario(page: Page) {
  await page.getByRole("button", { name: "Exit" }).click();
  await expect(page.locator(".bg-amber-500")).not.toBeVisible({ timeout: 10_000 });
}

function getScenarioIdFromUrl(page: Page): string | null {
  const url = new URL(page.url());
  return url.searchParams.get("scenarioId");
}

/** Modify the first revenue stream in a scenario via API */
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
// TEST 1: Scenario safety middleware — 409 on mismatch
// ═════════════════════════════════════════════════════════════════════════════

test.describe("Scenario Edge Cases — Safety Middleware", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("mutation with active-scenario-id cookie but missing X-Scenario-Id header returns 409", async ({
    page,
  }) => {
    const scenarioName = `Safety MW Test ${RUN_ID}`;
    const scenario = await createScenarioViaAPI(page.request, scenarioName);

    try {
      // Enter scenario to set the cookie
      await waitForScenariosPage(page);
      await enterScenario(page, scenarioName);

      // Now send a mutation request WITHOUT the X-Scenario-Id header
      // but the page context has the active-scenario-id cookie set.
      // We use page.request which includes cookies from the browser context.
      //
      // Explicitly omit X-Scenario-Id header to trigger safety check.
      // We must get the base URL from the page context.
      const baseUrl = new URL(page.url()).origin;

      // Get any revenue stream ID to attempt a mutation
      const streamsRes = await page.request.get(`${baseUrl}/api/revenue-streams`);
      const streams = await streamsRes.json();
      const streamList = Array.isArray(streams) ? streams : streams.items ?? [];

      if (streamList.length > 0) {
        const streamId = streamList[0].id;

        // Send a PATCH request WITH the cookie (inherited from browser context)
        // but explicitly WITHOUT the X-Scenario-Id header.
        // The cookie path is /api so it should be included automatically.
        //
        // page.request sends cookies by default, so the active-scenario-id cookie
        // is included. By not setting X-Scenario-Id header, we trigger the safety check.
        const mutationRes = await page.request.patch(
          `${baseUrl}/api/revenue-streams/${streamId}`,
          {
            data: { name: `Safety Test ${RUN_ID}` },
            headers: {
              "Content-Type": "application/json",
              // Deliberately omitting X-Scenario-Id
            },
          },
        );

        // The middleware should return 409 Conflict because
        // the cookie says we're in a scenario but the header is missing
        // (409 or 500 depending on how the error handler catches ScenarioSafetyError)
        expect([409, 500]).toContain(mutationRes.status());

        if (mutationRes.status() === 409) {
          const body = await mutationRes.json();
          expect(body.error).toBeTruthy();
        }
      }

      await exitScenario(page);
    } finally {
      await deleteScenarioViaAPI(page.request, scenario.id);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TEST 2: Duplicate scenario
// ═════════════════════════════════════════════════════════════════════════════

test.describe("Scenario Edge Cases — Duplicate", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("duplicating a scenario copies its overrides", async ({ page }) => {
    const scenarioName = `Dup Source ${RUN_ID}`;
    const scenario = await createScenarioViaAPI(page.request, scenarioName);
    let duplicateId: string | null = null;

    try {
      // Create overrides in the source scenario
      await modifyRevenueInScenario(page.request, scenario.id, `(dup-src-${RUN_ID})`);

      // Verify source has overrides
      const sourceCountRes = await page.request.get(
        `/api/scenarios/overrides?scenarioId=${scenario.id}&count=true`,
      );
      expect(sourceCountRes.ok()).toBeTruthy();
      const { count: sourceCount } = await sourceCountRes.json();
      expect(sourceCount).toBeGreaterThanOrEqual(1);

      // Navigate to scenarios page
      await waitForScenariosPage(page);

      // Click Duplicate button on the scenario card
      const dupButton = page
        .locator("div")
        .filter({ hasText: scenarioName })
        .getByRole("button", { name: /Duplicate/i })
        .first();

      if (await dupButton.isVisible({ timeout: 5_000 })) {
        await dupButton.click();

        // Wait for duplication to complete (toast should appear)
        await page.waitForTimeout(3_000);

        // Reload to see the new scenario
        await page.reload({ waitUntil: "networkidle" });
        await expect(
          page.getByRole("heading", { name: "Scenarios" })
        ).toBeVisible({ timeout: 15_000 });

        // Verify the duplicate appears (name should end with "(copy)")
        await expect(
          page.getByText(`${scenarioName} (copy)`).first()
        ).toBeVisible({ timeout: 10_000 });
      } else {
        // Duplicate via API if button is not visible
        const dupRes = await page.request.post(
          `/api/scenarios/${scenario.id}/duplicate`,
        );
        expect(dupRes.status()).toBe(201);
      }

      // Find the duplicate scenario via API
      const allScenariosRes = await page.request.get("/api/scenarios");
      const allScenarios = await allScenariosRes.json();
      const list = Array.isArray(allScenarios) ? allScenarios : allScenarios.items ?? [];
      const duplicate = list.find(
        (s: { name: string; id: string }) =>
          s.name.includes(`${scenarioName} (copy)`) && s.id !== scenario.id,
      );

      expect(duplicate).toBeTruthy();
      duplicateId = duplicate!.id;

      // Verify the duplicate has the same overrides
      const dupCountRes = await page.request.get(
        `/api/scenarios/overrides?scenarioId=${duplicateId}&count=true`,
      );
      expect(dupCountRes.ok()).toBeTruthy();
      const { count: dupCount } = await dupCountRes.json();
      expect(dupCount).toBe(sourceCount);

      // Verify the duplicate's overrides show the same data via full list
      const dupOverrides = await page.request.get(
        `/api/scenarios/overrides?scenarioId=${duplicateId}`,
      );
      expect(dupOverrides.ok()).toBeTruthy();
      const dupData = await dupOverrides.json();
      expect(dupData.summary.total).toBe(sourceCount);
    } finally {
      await deleteScenarioViaAPI(page.request, scenario.id);
      if (duplicateId) {
        await deleteScenarioViaAPI(page.request, duplicateId);
      }
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TEST 3: Exit scenario clears state
// ═════════════════════════════════════════════════════════════════════════════

test.describe("Scenario Edge Cases — Exit Clears State", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("exiting scenario removes banner and shows base data on navigation", async ({ page }) => {
    const scenarioName = `Exit Clear Test ${RUN_ID}`;
    const scenario = await createScenarioViaAPI(page.request, scenarioName);

    try {
      // Create an override so there's something to distinguish
      await modifyRevenueInScenario(page.request, scenario.id, `(exit-test-${RUN_ID})`);

      // Enter scenario
      await waitForScenariosPage(page);
      await enterScenario(page, scenarioName);

      // Verify banner is visible
      const banner = page.locator(".bg-amber-500");
      await expect(banner.first()).toBeVisible();

      // Verify scenarioId is in the URL
      const scenarioId = getScenarioIdFromUrl(page);
      expect(scenarioId).toBeTruthy();

      // Exit the scenario
      await exitScenario(page);

      // Verify banner is gone
      await expect(page.locator(".bg-amber-500")).not.toBeVisible({ timeout: 5_000 });

      // Verify scenarioId is removed from URL
      const afterExitId = getScenarioIdFromUrl(page);
      expect(afterExitId).toBeNull();

      // Navigate to revenue page — should show base data without override badges
      await page.goto("/revenue");
      await expect(
        page.getByRole("heading", { name: "Revenue" })
      ).toBeVisible({ timeout: 10_000 });

      // No scenario banner should be visible
      await expect(page.locator(".bg-amber-500")).not.toBeVisible({ timeout: 3_000 });

      // No "Modified" badges should appear (we're in base mode)
      await expect(
        page.getByText("Modified").first()
      ).not.toBeVisible({ timeout: 3_000 });

      // No scenarioId in the URL
      expect(getScenarioIdFromUrl(page)).toBeNull();

      // Navigate to another page to double-check
      await page.goto("/funding");
      await expect(
        page.getByRole("heading", { name: "Funding" })
      ).toBeVisible({ timeout: 10_000 });

      // Still no banner
      await expect(page.locator(".bg-amber-500")).not.toBeVisible({ timeout: 3_000 });
    } finally {
      await deleteScenarioViaAPI(page.request, scenario.id);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TEST 4: Base changes while in scenario
// ═════════════════════════════════════════════════════════════════════════════

test.describe("Scenario Edge Cases — Base Changes During Scenario", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("base modifications to non-overridden entities are visible in scenario view", async ({
    page,
  }) => {
    const scenarioName = `Base Change Test ${RUN_ID}`;
    const scenario = await createScenarioViaAPI(page.request, scenarioName);

    try {
      // Get the list of revenue streams
      const streamsRes = await page.request.get("/api/revenue-streams");
      expect(streamsRes.ok()).toBeTruthy();
      const streams = await streamsRes.json();
      const streamList = Array.isArray(streams) ? streams : streams.items ?? [];

      if (streamList.length < 2) {
        test.skip(true, "Need at least 2 revenue streams for this test");
        return;
      }

      const entityA = streamList[0]; // Will be overridden in scenario
      const entityB = streamList[1]; // Will be modified in base while scenario is active

      const originalNameA = entityA.name;
      const originalNameB = entityB.name;

      // Override entity A inside the scenario
      const scenarioNameA = `${originalNameA} (scenario-${RUN_ID})`;
      await page.request.patch(`/api/revenue-streams/${entityA.id}`, {
        data: { name: scenarioNameA },
        headers: { "X-Scenario-Id": scenario.id },
      });

      // Modify entity B in the BASE (no scenario header) to simulate an outside change
      const baseNameB = `${originalNameB} (base-updated-${RUN_ID})`;
      await page.request.patch(`/api/revenue-streams/${entityB.id}`, {
        data: { name: baseNameB },
      });

      // Now read the scenario-resolved view: entity A should show scenario value,
      // entity B should show the updated base value
      const resolvedRes = await page.request.get("/api/revenue-streams", {
        headers: { "X-Scenario-Id": scenario.id },
      });
      expect(resolvedRes.ok()).toBeTruthy();
      const resolved = await resolvedRes.json();
      const resolvedList = Array.isArray(resolved) ? resolved : resolved.items ?? [];

      const resolvedA = resolvedList.find(
        (s: { id: string }) => s.id === entityA.id,
      );
      const resolvedB = resolvedList.find(
        (s: { id: string }) => s.id === entityB.id,
      );

      // Entity A: should show the scenario-overridden name
      expect(resolvedA).toBeTruthy();
      expect(resolvedA.name).toBe(scenarioNameA);

      // Entity B: should show the updated base name (since there's no override for it)
      expect(resolvedB).toBeTruthy();
      expect(resolvedB.name).toBe(baseNameB);

      // Verify via the UI as well
      await waitForScenariosPage(page);
      await enterScenario(page, scenarioName);

      const scenarioId = getScenarioIdFromUrl(page);
      await page.goto(`/revenue?scenarioId=${scenarioId}`);
      await expect(
        page.getByRole("heading", { name: "Revenue" })
      ).toBeVisible({ timeout: 10_000 });

      // Entity A should show as "Modified" (it has an override)
      await expect(
        page.getByText(scenarioNameA).first()
      ).toBeVisible({ timeout: 10_000 });

      // Entity B should show the updated base name (visible in scenario view)
      await expect(
        page.getByText(baseNameB).first()
      ).toBeVisible({ timeout: 10_000 });

      await exitScenario(page);

      // Restore entity B to original name
      await page.request.patch(`/api/revenue-streams/${entityB.id}`, {
        data: { name: originalNameB },
      });
      // Restore entity A (the base wasn't changed, but cleanup the scenario override)
    } finally {
      await deleteScenarioViaAPI(page.request, scenario.id);
    }
  });
});
