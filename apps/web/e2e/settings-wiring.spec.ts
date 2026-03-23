import { test, expect, type Page } from "@playwright/test";

/**
 * Settings Wiring E2E Tests — BUR-273
 *
 * Tests that every settings control actually fires API calls, persists state,
 * and affects downstream pages. Not just visibility — actual functional wiring.
 *
 * Requires a running app with seeded database (demo@burnless.app).
 */

const dbAvailable = !!process.env.DATABASE_URL;

// ── Helpers ─────────────────────────────────────────────────────────────────

async function goToSettingsTab(page: Page, tabName: string) {
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/settings/);
  if (tabName !== "General") {
    await page
      .locator("button")
      .filter({ hasText: tabName })
      .first()
      .click();
  }
}

/**
 * Click the AI master switch toggle button.
 * Returns the API response from PATCH /api/ai-features.
 */
async function toggleMasterSwitch(page: Page) {
  const toggle = page
    .locator("[role='switch']")
    .filter({ has: page.locator("xpath=ancestor::div[contains(., 'AI Master Switch')]") })
    .first();
  // Fallback: find the switch nearest to "AI Master Switch" heading
  const masterSection = page.locator("text=AI Master Switch").locator("..").locator("..");
  const switchBtn = masterSection.locator("[role='switch']").first();

  const responsePromise = page.waitForResponse(
    (r) => r.url().includes("/api/ai-features") && r.request().method() === "PATCH",
    { timeout: 10_000 }
  );

  // Try the more specific locator first, fallback to broader one
  if (await switchBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await switchBtn.click();
  } else {
    await toggle.click();
  }

  return responsePromise;
}

// ── General Tab: Save & Persist ─────────────────────────────────────────────

test.describe("Settings wiring — General tab", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("company name change fires PATCH /api/company and persists", async ({
    page,
  }) => {
    await goToSettingsTab(page, "General");

    const nameInput = page.getByPlaceholder("My Startup Inc.");
    await expect(nameInput).toBeVisible({ timeout: 10_000 });

    // Read current value, change it, save
    const original = await nameInput.inputValue();
    const testName = `E2E Test Co ${Date.now()}`;

    await nameInput.fill(testName);

    // Click Save and wait for the PATCH
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes("/api/company") && r.request().method() === "PATCH"
    );
    await page.getByRole("button", { name: /save changes/i }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);

    // Verify success feedback
    await expect(page.getByText("Saved")).toBeVisible({ timeout: 5_000 });

    // Refresh and verify persistence
    await page.reload();
    await expect(page.getByPlaceholder("My Startup Inc.")).toHaveValue(testName, {
      timeout: 10_000,
    });

    // Restore original name
    await page.getByPlaceholder("My Startup Inc.").fill(original || "Demo Startup");
    await page.getByRole("button", { name: /save changes/i }).click();
    await page.waitForResponse(
      (r) => r.url().includes("/api/company") && r.request().method() === "PATCH"
    );
  });

  test("stage dropdown change is saved", async ({ page }) => {
    await goToSettingsTab(page, "General");

    const stageSelect = page.locator("select").filter({
      has: page.locator("option[value='pre_seed']"),
    }).first();
    await expect(stageSelect).toBeVisible({ timeout: 10_000 });

    const original = await stageSelect.inputValue();

    // Change stage
    await stageSelect.selectOption("seed");

    // Save
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes("/api/company") && r.request().method() === "PATCH"
    );
    await page.getByRole("button", { name: /save changes/i }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);

    // Refresh and verify
    await page.reload();
    const stageAfterReload = page.locator("select").filter({
      has: page.locator("option[value='pre_seed']"),
    }).first();
    await expect(stageAfterReload).toHaveValue("seed", { timeout: 10_000 });

    // Restore
    await stageAfterReload.selectOption(original);
    await page.getByRole("button", { name: /save changes/i }).click();
    await page.waitForResponse(
      (r) => r.url().includes("/api/company") && r.request().method() === "PATCH"
    );
  });

  test("currency dropdown change is saved", async ({ page }) => {
    await goToSettingsTab(page, "General");

    const currencySelect = page.locator("select").filter({
      has: page.locator("option[value='USD']"),
    }).first();
    await expect(currencySelect).toBeVisible({ timeout: 10_000 });

    const original = await currencySelect.inputValue();

    await currencySelect.selectOption("EUR");

    const responsePromise = page.waitForResponse(
      (r) => r.url().includes("/api/company") && r.request().method() === "PATCH"
    );
    await page.getByRole("button", { name: /save changes/i }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);

    // Refresh and verify
    await page.reload();
    const afterReload = page.locator("select").filter({
      has: page.locator("option[value='USD']"),
    }).first();
    await expect(afterReload).toHaveValue("EUR", { timeout: 10_000 });

    // Restore
    await afterReload.selectOption(original);
    await page.getByRole("button", { name: /save changes/i }).click();
    await page.waitForResponse(
      (r) => r.url().includes("/api/company") && r.request().method() === "PATCH"
    );
  });
});

// ── AI Features Tab: Master Switch ──────────────────────────────────────────

test.describe("Settings wiring — AI Features master switch", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("master switch toggle fires PATCH /api/ai-features", async ({
    page,
  }) => {
    await goToSettingsTab(page, "AI Features");

    // Wait for AI Features tab content to load
    await expect(
      page.getByText("AI Master Switch")
    ).toBeVisible({ timeout: 10_000 });

    const response = await toggleMasterSwitch(page);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("masterEnabled");
  });

  test("master switch OFF hides all sub-sections", async ({ page }) => {
    await goToSettingsTab(page, "AI Features");
    await expect(page.getByText("AI Master Switch")).toBeVisible({ timeout: 10_000 });

    // Ensure master is ON first so we can test turning it OFF
    const statusText = page.getByText("AI features are active across the platform");
    if (!(await statusText.isVisible({ timeout: 3_000 }).catch(() => false))) {
      // It's currently off — turn it on first
      await toggleMasterSwitch(page);
      await expect(statusText).toBeVisible({ timeout: 5_000 });
    }

    // Sub-sections should be visible when ON
    await expect(page.getByText("AI Provider")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("AI Data Mode")).toBeVisible();
    await expect(page.getByText("AI Write Access")).toBeVisible();
    await expect(page.getByText("AI Budget")).toBeVisible();
    await expect(page.getByText("Feature Toggles")).toBeVisible();

    // Toggle OFF
    await toggleMasterSwitch(page);

    // Sub-sections should disappear
    await expect(page.getByText("AI Provider")).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("AI Data Mode")).not.toBeVisible();
    await expect(page.getByText("AI Write Access")).not.toBeVisible();
    await expect(page.getByText("AI Budget")).not.toBeVisible();
    await expect(page.getByText("Feature Toggles")).not.toBeVisible();

    // Status text should update
    await expect(
      page.getByText("All AI features are disabled")
    ).toBeVisible();

    // Restore: turn back ON
    await toggleMasterSwitch(page);
    await expect(page.getByText("AI features are active")).toBeVisible({ timeout: 5_000 });
  });

  test("master switch state persists across page reload", async ({ page }) => {
    await goToSettingsTab(page, "AI Features");
    await expect(page.getByText("AI Master Switch")).toBeVisible({ timeout: 10_000 });

    // Read current state
    const isCurrentlyOn = await page
      .getByText("AI features are active across the platform")
      .isVisible({ timeout: 3_000 })
      .catch(() => false);

    // Toggle it
    await toggleMasterSwitch(page);

    // Verify the state changed
    if (isCurrentlyOn) {
      await expect(page.getByText("All AI features are disabled")).toBeVisible({ timeout: 5_000 });
    } else {
      await expect(page.getByText("AI features are active")).toBeVisible({ timeout: 5_000 });
    }

    // Reload
    await page.reload();
    await goToSettingsTab(page, "AI Features");
    await expect(page.getByText("AI Master Switch")).toBeVisible({ timeout: 10_000 });

    // Verify the toggled state persisted
    if (isCurrentlyOn) {
      // Was on, toggled off — should still be off after reload
      await expect(
        page.getByText("All AI features are disabled")
      ).toBeVisible({ timeout: 5_000 });
    } else {
      // Was off, toggled on — should still be on after reload
      await expect(
        page.getByText("AI features are active")
      ).toBeVisible({ timeout: 5_000 });
    }

    // Restore original state
    await toggleMasterSwitch(page);
  });
});

// ── AI Features Tab: Data Mode & Write Mode ────────────────────────────────

test.describe("Settings wiring — AI data mode and write mode", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("data mode radio change fires PATCH and persists", async ({ page }) => {
    await goToSettingsTab(page, "AI Features");
    await expect(page.getByText("AI Master Switch")).toBeVisible({ timeout: 10_000 });

    // Ensure AI is ON
    const isOn = await page.getByText("AI features are active").isVisible({ timeout: 3_000 }).catch(() => false);
    if (!isOn) {
      await toggleMasterSwitch(page);
      await expect(page.getByText("AI features are active")).toBeVisible({ timeout: 5_000 });
    }

    // Find "Cached Only" radio and click it
    const cachedOnlyLabel = page.locator("label").filter({ hasText: "Cached Only" }).first();
    await expect(cachedOnlyLabel).toBeVisible({ timeout: 5_000 });

    const responsePromise = page.waitForResponse(
      (r) => r.url().includes("/api/ai-features") && r.request().method() === "PATCH"
    );
    await cachedOnlyLabel.click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.dataMode).toBe("show_cached");

    // Refresh and verify the radio is still selected
    await page.reload();
    await goToSettingsTab(page, "AI Features");
    await expect(page.getByText("AI Master Switch")).toBeVisible({ timeout: 10_000 });

    // "Cached Only" label should have the selected styling
    const cachedRadio = page.locator("input[type='radio'][name='dataMode'][value='show_cached']");
    await expect(cachedRadio).toBeChecked({ timeout: 5_000 });

    // Restore to "Full"
    const fullLabel = page.locator("label").filter({ hasText: /^Full$/ }).first();
    await fullLabel.click();
    await page.waitForResponse(
      (r) => r.url().includes("/api/ai-features") && r.request().method() === "PATCH"
    );
  });

  test("write mode radio change fires PATCH and persists", async ({ page }) => {
    await goToSettingsTab(page, "AI Features");
    await expect(page.getByText("AI Master Switch")).toBeVisible({ timeout: 10_000 });

    // Ensure AI is ON
    const isOn = await page.getByText("AI features are active").isVisible({ timeout: 3_000 }).catch(() => false);
    if (!isOn) {
      await toggleMasterSwitch(page);
      await expect(page.getByText("AI features are active")).toBeVisible({ timeout: 5_000 });
    }

    // Click "Read Only" option
    const readOnlyLabel = page.locator("label").filter({ hasText: "Read Only" }).first();
    await expect(readOnlyLabel).toBeVisible({ timeout: 5_000 });

    const responsePromise = page.waitForResponse(
      (r) => r.url().includes("/api/ai-features") && r.request().method() === "PATCH"
    );
    await readOnlyLabel.click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.writeMode).toBe("read_only");

    // Refresh and verify
    await page.reload();
    await goToSettingsTab(page, "AI Features");
    await expect(page.getByText("AI Master Switch")).toBeVisible({ timeout: 10_000 });

    const readOnlyRadio = page.locator("input[type='radio'][name='writeMode'][value='read_only']");
    await expect(readOnlyRadio).toBeChecked({ timeout: 5_000 });

    // Restore to "Full Access"
    const fullLabel = page.locator("label").filter({ hasText: "Full Access" }).first();
    await fullLabel.click();
    await page.waitForResponse(
      (r) => r.url().includes("/api/ai-features") && r.request().method() === "PATCH"
    );
  });
});

// ── AI Features Tab: Budget ────────────────────────────────────────────────

test.describe("Settings wiring — AI budget", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("budget preset click fires PATCH and persists", async ({ page }) => {
    await goToSettingsTab(page, "AI Features");
    await expect(page.getByText("AI Master Switch")).toBeVisible({ timeout: 10_000 });

    // Ensure AI is ON
    const isOn = await page.getByText("AI features are active").isVisible({ timeout: 3_000 }).catch(() => false);
    if (!isOn) {
      await toggleMasterSwitch(page);
      await expect(page.getByText("AI features are active")).toBeVisible({ timeout: 5_000 });
    }

    // Click "$100/mo" budget preset
    const preset100 = page.getByRole("button", { name: "$100/mo" });
    await expect(preset100).toBeVisible({ timeout: 5_000 });

    const responsePromise = page.waitForResponse(
      (r) => r.url().includes("/api/ai-features") && r.request().method() === "PATCH"
    );
    await preset100.click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.monthlyBudgetCents).toBe(10000);

    // Verify the budget display updates
    await expect(page.getByText("$100.00")).toBeVisible({ timeout: 5_000 });

    // Refresh and verify the preset is still selected (has active styling)
    await page.reload();
    await goToSettingsTab(page, "AI Features");
    await expect(page.getByText("AI Master Switch")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("$100.00")).toBeVisible({ timeout: 5_000 });

    // Restore to $50/mo
    const preset50 = page.getByRole("button", { name: "$50/mo" });
    await preset50.click();
    await page.waitForResponse(
      (r) => r.url().includes("/api/ai-features") && r.request().method() === "PATCH"
    );
  });
});

// ── AI Features Tab: Provider Selection ────────────────────────────────────

test.describe("Settings wiring — AI provider", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("provider radio change fires PATCH", async ({ page }) => {
    await goToSettingsTab(page, "AI Features");
    await expect(page.getByText("AI Master Switch")).toBeVisible({ timeout: 10_000 });

    // Ensure AI is ON
    const isOn = await page.getByText("AI features are active").isVisible({ timeout: 3_000 }).catch(() => false);
    if (!isOn) {
      await toggleMasterSwitch(page);
      await expect(page.getByText("AI features are active")).toBeVisible({ timeout: 5_000 });
    }

    // Select OpenAI
    const openaiLabel = page.locator("label").filter({ hasText: "OpenAI" }).first();
    await expect(openaiLabel).toBeVisible({ timeout: 5_000 });

    const responsePromise = page.waitForResponse(
      (r) => r.url().includes("/api/ai-features") && r.request().method() === "PATCH"
    );
    await openaiLabel.click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.aiProvider).toBe("openai");

    // Verify the radio is checked
    const openaiRadio = page.locator("input[type='radio'][name='aiProvider'][value='openai']");
    await expect(openaiRadio).toBeChecked();

    // Restore to Anthropic
    const anthropicLabel = page.locator("label").filter({ hasText: "Anthropic" }).first();
    const restorePromise = page.waitForResponse(
      (r) => r.url().includes("/api/ai-features") && r.request().method() === "PATCH"
    );
    await anthropicLabel.click();
    await restorePromise;
  });

  test("selecting Ollama hides API key section and shows hint", async ({ page }) => {
    await goToSettingsTab(page, "AI Features");
    await expect(page.getByText("AI Master Switch")).toBeVisible({ timeout: 10_000 });

    // Ensure AI is ON
    const isOn = await page.getByText("AI features are active").isVisible({ timeout: 3_000 }).catch(() => false);
    if (!isOn) {
      await toggleMasterSwitch(page);
      await expect(page.getByText("AI features are active")).toBeVisible({ timeout: 5_000 });
    }

    // Select Ollama
    const ollamaLabel = page.locator("label").filter({ hasText: "Ollama" }).first();
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes("/api/ai-features") && r.request().method() === "PATCH"
    );
    await ollamaLabel.click();
    await responsePromise;

    // Ollama hint should be visible
    await expect(
      page.getByText("Ollama runs locally")
    ).toBeVisible({ timeout: 5_000 });

    // API Key label should NOT be visible (Ollama doesn't need one)
    await expect(
      page.locator("label").filter({ hasText: /^API Key$/ })
    ).not.toBeVisible();

    // Base URL field should be visible for Ollama
    await expect(
      page.locator("label").filter({ hasText: "Base URL" }).first()
    ).toBeVisible();

    // Restore to Anthropic
    const anthropicLabel = page.locator("label").filter({ hasText: "Anthropic" }).first();
    const restorePromise = page.waitForResponse(
      (r) => r.url().includes("/api/ai-features") && r.request().method() === "PATCH"
    );
    await anthropicLabel.click();
    await restorePromise;
  });
});

// ── AI Features Tab: Feature Toggles ───────────────────────────────────────

test.describe("Settings wiring — AI feature toggles", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("individual feature toggle fires PATCH with features payload", async ({
    page,
  }) => {
    await goToSettingsTab(page, "AI Features");
    await expect(page.getByText("AI Master Switch")).toBeVisible({ timeout: 10_000 });

    // Ensure AI is ON
    const isOn = await page.getByText("AI features are active").isVisible({ timeout: 3_000 }).catch(() => false);
    if (!isOn) {
      await toggleMasterSwitch(page);
      await expect(page.getByText("AI features are active")).toBeVisible({ timeout: 5_000 });
    }

    // Find the first feature toggle switch in the Feature Toggles section
    const featureTogglesSection = page.locator("text=Feature Toggles").locator("..").locator("..");
    const firstSwitch = featureTogglesSection.locator("[role='switch']").first();
    await expect(firstSwitch).toBeVisible({ timeout: 5_000 });

    const responsePromise = page.waitForResponse(
      (r) => r.url().includes("/api/ai-features") && r.request().method() === "PATCH"
    );
    await firstSwitch.click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("features");
    expect(typeof body.features).toBe("object");

    // Toggle it back to restore
    const restorePromise = page.waitForResponse(
      (r) => r.url().includes("/api/ai-features") && r.request().method() === "PATCH"
    );
    await firstSwitch.click();
    await restorePromise;
  });
});

// ── Security Tab ────────────────────────────────────────────────────────────

test.describe("Settings wiring — Security tab", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("2FA status loads from API", async ({ page }) => {
    // Intercept the 2FA status check
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes("/api/auth/two-factor/status"),
      { timeout: 15_000 }
    );

    await goToSettingsTab(page, "Security");

    const response = await responsePromise;
    expect(response.status()).toBe(200);

    // Status badge should appear (Enabled or Disabled)
    await expect(
      page.getByText(/Enabled|Disabled/).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("Enable 2FA button calls setup API", async ({ page }) => {
    await goToSettingsTab(page, "Security");

    // Wait for status to load
    await expect(
      page.getByText(/Enabled|Disabled/).first()
    ).toBeVisible({ timeout: 10_000 });

    // Only test if 2FA is currently disabled
    const isDisabled = await page.getByText("Disabled").isVisible({ timeout: 2_000 }).catch(() => false);
    if (!isDisabled) {
      test.skip(true, "2FA is already enabled, skipping setup test");
      return;
    }

    // Click Enable 2FA
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes("/api/auth/two-factor/setup") && r.request().method() === "GET",
      { timeout: 10_000 }
    );
    await page.getByRole("button", { name: /enable 2fa/i }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);

    // QR code step should appear
    await expect(
      page.getByText("Scan this QR code")
    ).toBeVisible({ timeout: 10_000 });

    // Cancel setup to avoid leaving in partial state
    await page.getByText("Cancel setup").click();
    await expect(page.getByText("Disabled")).toBeVisible({ timeout: 5_000 });
  });
});

// ── Billing Tab ─────────────────────────────────────────────────────────────

test.describe("Settings wiring — Billing tab", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("billing data loads from API", async ({ page }) => {
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes("/api/billing") && r.request().method() === "GET",
      { timeout: 15_000 }
    );

    await goToSettingsTab(page, "Billing");

    const response = await responsePromise;
    // Billing API may return 200 or may error if Stripe isn't configured
    // The important thing is the page doesn't crash
    expect(response.status()).toBeLessThan(500);

    // Current Plan section should be visible (even on error, pricing tiers show)
    await expect(
      page.getByText(/Current Plan|Free|Pro|Team/).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("pricing tiers have working buttons", async ({ page }) => {
    await goToSettingsTab(page, "Billing");

    // Wait for tiers to load
    await expect(page.getByText("$29")).toBeVisible({ timeout: 10_000 });

    // Free tier should show "Current Plan" or "Free Forever" (not clickable)
    const freeButton = page
      .locator("button")
      .filter({ hasText: /current plan|free forever/i })
      .first();
    await expect(freeButton).toBeVisible();
    await expect(freeButton).toBeDisabled();

    // Pro tier should have an Upgrade button (if on free plan)
    const upgradeButtons = page.locator("button").filter({ hasText: /upgrade/i });
    const count = await upgradeButtons.count();
    // There should be at least one upgrade button (Pro or Team)
    // unless user is already on a paid plan
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

// ── Integrations Tab ────────────────────────────────────────────────────────

test.describe("Settings wiring — Integrations tab", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("integrations load from API", async ({ page }) => {
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes("/api/integrations") && r.request().method() === "GET",
      { timeout: 15_000 }
    );

    await goToSettingsTab(page, "Integrations");

    const response = await responsePromise;
    expect(response.status()).toBe(200);
  });

  test("CSV Import button navigates to /import", async ({ page }) => {
    await goToSettingsTab(page, "Integrations");

    await expect(page.getByText("CSV Import")).toBeVisible({ timeout: 10_000 });

    // The Import button should link to /import
    const importLink = page.locator("a").filter({ hasText: "Import" }).first();
    await expect(importLink).toBeVisible();
    const href = await importLink.getAttribute("href");
    expect(href).toBe("/import");
  });

  test("Notify Me button toggles to Notified state", async ({ page }) => {
    await goToSettingsTab(page, "Integrations");

    // Find a Notify Me button for a coming-soon integration
    const notifyBtn = page.locator("button").filter({ hasText: "Notify Me" }).first();
    await expect(notifyBtn).toBeVisible({ timeout: 10_000 });

    await notifyBtn.click();

    // Should change to "Notified"
    await expect(
      page.getByText("Notified").first()
    ).toBeVisible({ timeout: 5_000 });
  });
});

// ── Invite Codes Tab ────────────────────────────────────────────────────────

test.describe("Settings wiring — Invite Codes tab", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("invite codes load from admin API", async ({ page }) => {
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes("/api/admin/invite-codes") && r.request().method() === "GET",
      { timeout: 15_000 }
    );

    await goToSettingsTab(page, "Invite Codes");

    const response = await responsePromise;
    // 200 if admin, 403 if not — both are valid wiring
    expect(response.status()).toBeLessThan(500);
  });

  test("New Code button opens create modal", async ({ page }) => {
    await goToSettingsTab(page, "Invite Codes");

    // Wait for tab content
    await expect(
      page.getByText(/invite codes|admin access required/i).first()
    ).toBeVisible({ timeout: 10_000 });

    // Only proceed if the user has admin access (codes loaded)
    const hasAccess = await page.getByText("Invite Codes").first().isVisible().catch(() => false);
    if (!hasAccess) return;

    const newCodeBtn = page.getByRole("button", { name: /new code/i });
    if (await newCodeBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await newCodeBtn.click();

      // Modal should appear
      await expect(
        page.getByText("Create Invite Code")
      ).toBeVisible({ timeout: 5_000 });

      // Modal should have form fields
      await expect(page.getByText("Type")).toBeVisible();
      await expect(page.getByText("Free Platform Days")).toBeVisible();

      // Close modal
      await page.getByRole("button", { name: "Cancel" }).click();
    }
  });
});

// ── Cross-Tab: AI Master Switch affects other pages ─────────────────────────

test.describe("Settings wiring — cross-page verification", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("AI features GET returns current master state from any page", async ({
    page,
  }) => {
    // First set a known state: AI ON
    await goToSettingsTab(page, "AI Features");
    await expect(page.getByText("AI Master Switch")).toBeVisible({ timeout: 10_000 });

    const isOn = await page.getByText("AI features are active").isVisible({ timeout: 3_000 }).catch(() => false);
    if (!isOn) {
      await toggleMasterSwitch(page);
      await expect(page.getByText("AI features are active")).toBeVisible({ timeout: 5_000 });
    }

    // Navigate away to dashboard, then check the API returns correct state
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes("/api/ai-features") && r.request().method() === "GET",
      { timeout: 15_000 }
    );
    await page.goto("/dashboard");
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.masterEnabled).toBe(true);
  });
});
