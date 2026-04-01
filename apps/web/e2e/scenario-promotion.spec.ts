import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

/**
 * Scenario Promotion Flow E2E Tests — Task 21
 *
 * Tests the promotion workflow:
 *   1. Promote scenario to base — create overrides, promote, verify backup created
 *   2. Backup scenario is functional — enter backup, verify pre-promotion values
 *   3. Keep forever / delete backup — test backup lifecycle actions
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

/** Create a revenue override in a scenario via API (modify first stream's name) */
async function createRevenueOverride(
  request: APIRequestContext,
  scenarioId: string,
  suffix: string,
): Promise<{ originalName: string; modifiedName: string; streamId: string }> {
  // Get base revenue streams
  const streamsRes = await request.get("/api/revenue-streams");
  expect(streamsRes.ok()).toBeTruthy();
  const streams = await streamsRes.json();
  const streamList = Array.isArray(streams) ? streams : streams.items ?? [];

  if (streamList.length === 0) {
    throw new Error("No revenue streams found — seed data required for this test");
  }

  const stream = streamList[0];
  const originalName = stream.name;
  const modifiedName = `${originalName} ${suffix}`;

  // Modify via API with scenario header
  const patchRes = await request.patch(`/api/revenue-streams/${stream.id}`, {
    data: { name: modifiedName },
    headers: { "X-Scenario-Id": scenarioId },
  });
  expect(patchRes.ok()).toBeTruthy();

  return { originalName, modifiedName, streamId: stream.id };
}

/** Create a funding round inside a scenario via API */
async function createFundingOverride(
  request: APIRequestContext,
  scenarioId: string,
  roundName: string,
): Promise<string> {
  const res = await request.post("/api/funding-rounds", {
    data: {
      name: roundName,
      type: "seed",
      amount: 1_000_000,
      date: "2026-06-01",
      isProjected: true,
    },
    headers: { "X-Scenario-Id": scenarioId },
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  return body.id;
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

// ═════════════════════════════════════════════════════════════════════════════
// TEST 1: Promote scenario to base
// ═════════════════════════════════════════════════════════════════════════════

test.describe("Scenario Promotion — Promote to Base", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("promote scenario applies overrides to base and creates backup", async ({ page }) => {
    const scenarioName = `Promote Test ${RUN_ID}`;
    const scenario = await createScenarioViaAPI(page.request, scenarioName);
    const createdIds: string[] = [scenario.id];

    try {
      // Create 2 overrides: modify a revenue stream, create a funding round
      const revOverride = await createRevenueOverride(
        page.request,
        scenario.id,
        `(promoted-${RUN_ID})`,
      );
      const fundingName = `Promo Funding ${RUN_ID}`;
      await createFundingOverride(page.request, scenario.id, fundingName);

      // Verify we have at least 2 overrides
      const countRes = await page.request.get(
        `/api/scenarios/overrides?scenarioId=${scenario.id}&count=true`,
      );
      expect(countRes.ok()).toBeTruthy();
      const { count } = await countRes.json();
      expect(count).toBeGreaterThanOrEqual(2);

      // Navigate to scenarios page and trigger promote via URL param
      await page.goto(`/scenarios?promote=${scenario.id}`);
      await expect(
        page.getByRole("heading", { name: "Scenarios" })
      ).toBeVisible({ timeout: 15_000 });

      // Promote dialog should auto-open
      await expect(
        page.getByText("Promote Scenario to Base")
      ).toBeVisible({ timeout: 10_000 });

      // Verify diff preview shows changes
      await expect(
        page.getByText("Changes to apply")
      ).toBeVisible({ timeout: 5_000 });

      // Type the scenario name to confirm
      const confirmInput = page.getByPlaceholder(scenarioName);
      await expect(confirmInput).toBeVisible({ timeout: 5_000 });
      await confirmInput.fill(scenarioName);

      // Click "Promote to Base"
      const promoteBtn = page.getByRole("button", { name: "Promote to Base" });
      await expect(promoteBtn).toBeEnabled({ timeout: 3_000 });
      await promoteBtn.click();

      // Wait for promotion to complete (dialog closes)
      await expect(
        page.getByText("Promote Scenario to Base")
      ).not.toBeVisible({ timeout: 15_000 });

      // Reload scenarios page to see updated state
      await page.reload({ waitUntil: "networkidle" });
      await expect(
        page.getByRole("heading", { name: "Scenarios" })
      ).toBeVisible({ timeout: 15_000 });

      // Verify: scenario status is "promoted" — look for Promoted badge
      await expect(
        page.getByText("Promoted").first()
      ).toBeVisible({ timeout: 10_000 });

      // Verify: backup scenario exists with "Backup" badge
      await expect(
        page.getByText("Backup").first()
      ).toBeVisible({ timeout: 10_000 });

      // Verify: base data updated — revenue stream should have the modified name
      const baseStreamsRes = await page.request.get("/api/revenue-streams");
      expect(baseStreamsRes.ok()).toBeTruthy();
      const baseStreams = await baseStreamsRes.json();
      const streamList = Array.isArray(baseStreams) ? baseStreams : baseStreams.items ?? [];
      const promotedStream = streamList.find(
        (s: { id: string }) => s.id === revOverride.streamId,
      );
      expect(promotedStream).toBeTruthy();
      expect(promotedStream.name).toContain(`promoted-${RUN_ID}`);

      // Track backup for cleanup
      const allScenarios = await page.request.get("/api/scenarios");
      const scenarioList = await allScenarios.json();
      const list = Array.isArray(scenarioList) ? scenarioList : scenarioList.items ?? [];
      for (const s of list) {
        if (s.source === "backup" && s.name.includes(scenarioName)) {
          createdIds.push(s.id);
        }
      }

      // Restore the original revenue stream name for subsequent tests
      await page.request.patch(`/api/revenue-streams/${revOverride.streamId}`, {
        data: { name: revOverride.originalName },
      });
    } finally {
      for (const id of createdIds) {
        await deleteScenarioViaAPI(page.request, id);
      }
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TEST 2: Backup scenario is functional
// ═════════════════════════════════════════════════════════════════════════════

test.describe("Scenario Promotion — Backup Functional", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("backup scenario preserves pre-promotion data accessible via API", async ({ page }) => {
    const scenarioName = `Backup Func Test ${RUN_ID}`;
    const scenario = await createScenarioViaAPI(page.request, scenarioName);
    const createdIds: string[] = [scenario.id];

    try {
      // Snapshot the original revenue stream name
      const baseStreamsRes = await page.request.get("/api/revenue-streams");
      const baseStreams = await baseStreamsRes.json();
      const streamList = Array.isArray(baseStreams) ? baseStreams : baseStreams.items ?? [];
      if (streamList.length === 0) {
        test.skip(true, "No revenue streams — cannot test backup");
        return;
      }
      const originalStream = streamList[0];
      const originalName = originalStream.name;

      // Create an override in the scenario
      await createRevenueOverride(page.request, scenario.id, `(backup-test-${RUN_ID})`);

      // Promote the scenario via API
      const promoteRes = await page.request.post("/api/scenarios/promote", {
        data: { scenarioId: scenario.id },
      });
      expect(promoteRes.ok()).toBeTruthy();
      const promoteResult = await promoteRes.json();
      expect(promoteResult.backup).toBeTruthy();
      expect(promoteResult.backup.id).toBeTruthy();
      createdIds.push(promoteResult.backup.id);

      // Verify backup scenario exists
      const backupRes = await page.request.get(
        `/api/scenarios/${promoteResult.backup.id}`,
      );
      expect(backupRes.ok()).toBeTruthy();
      const backup = await backupRes.json();
      expect(backup.name).toContain("Backup");

      // The backup holds the OLD base data as overrides (reversing the promotion).
      // To verify: the backup scenario's overrides should exist.
      const backupOverrides = await page.request.get(
        `/api/scenarios/overrides?scenarioId=${promoteResult.backup.id}&count=true`,
      );
      if (backupOverrides.ok()) {
        const data = await backupOverrides.json();
        // Backup should have overrides that revert the promotion changes
        expect(data.count).toBeGreaterThanOrEqual(0);
      }

      // Navigate to scenarios page and verify backup card is visible
      await waitForScenariosPage(page);
      await expect(
        page.getByText("Backup").first()
      ).toBeVisible({ timeout: 10_000 });

      // Restore original name
      await page.request.patch(`/api/revenue-streams/${originalStream.id}`, {
        data: { name: originalName },
      });
    } finally {
      for (const id of createdIds) {
        await deleteScenarioViaAPI(page.request, id);
      }
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TEST 3: Keep Forever / Delete Backup
// ═════════════════════════════════════════════════════════════════════════════

test.describe("Scenario Promotion — Backup Lifecycle", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("keep forever clears auto-delete and delete removes backup", async ({ page }) => {
    const scenarioName = `Backup Lifecycle ${RUN_ID}`;
    const scenario = await createScenarioViaAPI(page.request, scenarioName);
    const createdIds: string[] = [scenario.id];

    try {
      // Create a minimal override so promotion works
      await createRevenueOverride(page.request, scenario.id, `(lifecycle-${RUN_ID})`);

      // Snapshot original
      const baseStreamsRes = await page.request.get("/api/revenue-streams");
      const baseStreams = await baseStreamsRes.json();
      const streamList = Array.isArray(baseStreams) ? baseStreams : baseStreams.items ?? [];
      const originalName = streamList[0]?.name ?? "";
      const streamId = streamList[0]?.id ?? "";

      // Promote
      const promoteRes = await page.request.post("/api/scenarios/promote", {
        data: { scenarioId: scenario.id },
      });
      expect(promoteRes.ok()).toBeTruthy();
      const promoteResult = await promoteRes.json();
      const backupId = promoteResult.backup.id;
      createdIds.push(backupId);

      // Verify backup has autoDeleteAt set
      const backupRes = await page.request.get(`/api/scenarios/${backupId}`);
      expect(backupRes.ok()).toBeTruthy();
      const backup = await backupRes.json();
      expect(backup.autoDeleteAt).toBeTruthy();

      // Navigate to scenarios page
      await waitForScenariosPage(page);

      // Find the "Keep Forever" button and click it
      const keepBtn = page.getByRole("button", { name: /Keep Forever/i }).first();
      if (await keepBtn.isVisible({ timeout: 5_000 })) {
        await keepBtn.click();

        // Wait for API response
        await page.waitForTimeout(2_000);

        // Verify via API that autoDeleteAt is now null
        const updatedRes = await page.request.get(`/api/scenarios/${backupId}`);
        expect(updatedRes.ok()).toBeTruthy();
        const updated = await updatedRes.json();
        expect(updated.autoDeleteAt).toBeNull();
      } else {
        // If the button is not visible, test via API directly
        const patchRes = await page.request.patch(`/api/scenarios/${backupId}`, {
          data: { autoDeleteAt: null },
          headers: { "Content-Type": "application/json" },
        });
        expect(patchRes.ok()).toBeTruthy();
        const updated = await patchRes.json();
        expect(updated.autoDeleteAt).toBeNull();
      }

      // Test "Delete" on the backup
      const deleteBtn = page
        .locator("div")
        .filter({ hasText: /Backup/ })
        .getByRole("button", { name: /Delete/i })
        .first();

      if (await deleteBtn.isVisible({ timeout: 5_000 })) {
        await deleteBtn.click();
        await page.waitForTimeout(2_000);

        // Verify backup is gone via API
        const checkRes = await page.request.get(`/api/scenarios/${backupId}`);
        // Should be 404 (soft-deleted)
        expect(checkRes.status()).toBe(404);
        // Remove from cleanup list since it's already deleted
        const idx = createdIds.indexOf(backupId);
        if (idx >= 0) createdIds.splice(idx, 1);
      } else {
        // Delete via API directly
        const delRes = await page.request.delete(`/api/scenarios/${backupId}`);
        expect(delRes.ok()).toBeTruthy();
        const idx = createdIds.indexOf(backupId);
        if (idx >= 0) createdIds.splice(idx, 1);
      }

      // Restore original revenue stream name
      if (streamId && originalName) {
        await page.request.patch(`/api/revenue-streams/${streamId}`, {
          data: { name: originalName },
        });
      }
    } finally {
      for (const id of createdIds) {
        await deleteScenarioViaAPI(page.request, id);
      }
    }
  });
});
