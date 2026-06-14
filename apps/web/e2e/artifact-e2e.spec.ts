// apps/web/e2e/artifact-e2e.spec.ts
//
// S5 P4 (Task 10) — end-to-end browser acceptance against a LIVE, already-running
// burnless fat-artifact (BASE_URL; no dev webServer, no auth.setup — the self-host
// artifact auto-logs-in the owner). Branches on three env vars set by the matrix:
//   BURNLESS_CRED_PATH  cli | ui   — "cli" creds were pre-added by acceptance-env.sh;
//                                     "ui" adds the OpenRouter provider through the UI.
//   BURNLESS_E2E_ACTION chat | revenue | settings — the post-onboarding assertion.
//   OPENROUTER_API_KEY  live key (ui cred-path + chat); passed only via env, never logged.
//
// Flow (founder steps 4–6): goto("/") → auto-login lands on /onboarding (WebsiteStep).
//   → "I'll fill in manually" enters the wizard at its FIRST step.
//   → self-host first step is the AI-config step ("Connect your AI") embedding the P3
//     AiProvidersManager. ui path: add OpenRouter (prefilled name+baseURL) + live key +
//     default model → Save provider → confirm the row appears. cli path: provider already
//     present (added by the harness), so just continue.
//   → walk the wizard (ai-config → company-claim → revenue → funding → expenses → team)
//     to the dashboard via the single global Continue / Skip.
//   → the assigned action + assert persistence.
//
// Selectors were authored against the running artifact (Playwright MCP snapshots), not blind.
import { expect, test, type Page } from "@playwright/test";

const CRED_PATH = process.env.BURNLESS_CRED_PATH ?? "ui"; // "cli" creds already added by the harness
const ACTION = process.env.BURNLESS_E2E_ACTION ?? "chat"; // chat | revenue | settings
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY ?? "";

/** The cookie-consent dialog can mount with a delay over the first paint; dismiss it if it
 *  appears so it never intercepts a click. Non-fatal if it never shows. */
async function dismissCookieConsent(page: Page): Promise<void> {
  const essential = page.getByRole("button", { name: /essential only/i });
  await essential.click({ timeout: 4_000 }).catch(() => {});
}

/** Step 4 (ui path): add the OpenRouter provider with the live key via the embedded
 *  AiProvidersManager (the P3 modal: 8-tile catalog → OpenRouter prefills name+baseURL;
 *  fill key + a default model; Save provider; the connected row then renders). */
async function addProviderViaUi(page: Page): Promise<void> {
  // Empty-state CTA is "Add your first provider"; a populated list uses "Add provider".
  await page
    .getByRole("button", { name: /add (your first )?provider/i })
    .first()
    .click();

  const dialog = page.getByRole("dialog", { name: /add a provider/i });
  await expect(dialog).toBeVisible();

  // 8-tile catalog → OpenRouter tile (aria-label "OpenRouter"); prefills name + baseURL.
  await dialog.getByRole("button", { name: "OpenRouter", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: /display name/i })).toHaveValue(
    "OpenRouter",
  );

  // A default model id makes chat deterministic (OpenRouter does not auto-pick one).
  await dialog.getByRole("textbox", { name: /default model/i }).fill("openai/gpt-4o-mini");
  // The live key — fill() keeps it out of any log (never typed into the transcript).
  await dialog.getByRole("textbox", { name: /api key/i }).fill(OPENROUTER_KEY);

  const saved = page.waitForResponse(
    (res) =>
      res.url().includes("/api/ai-features/providers") &&
      res.request().method() === "POST",
    { timeout: 30_000 },
  );
  await dialog.getByRole("button", { name: /save provider/i }).click();
  const savedRes = await saved;
  expect(savedRes.status(), "provider create must succeed").toBeLessThan(400);

  // Modal closes; the manager re-renders with the connected provider row.
  await expect(dialog).toBeHidden();
  await expect(page.getByText("OpenRouter").first()).toBeVisible();
}

/** Step 5: walk the wizard to the dashboard. The AI-config step is satisfied by the
 *  configured provider (cli: pre-added; ui: just added) — Continue advances it. The
 *  Company step REQUIRES a name (its submit() blocks otherwise) and cannot be skipped.
 *  The remaining data steps (revenue/funding/expenses/team) are skipped — the goal is to
 *  REACH the dashboard, not to enter realistic data. */
async function completeOnboarding(page: Page): Promise<void> {
  const onDashboard = () =>
    /\/(dashboard|overview)/.test(new URL(page.url()).pathname);

  for (let i = 0; i < 12 && !onDashboard(); i++) {
    // Company step: fill the required name, then Continue (it cannot be skipped).
    const companyName = page.getByLabel("Company name");
    if (await companyName.isVisible().catch(() => false)) {
      const v = await companyName.inputValue().catch(() => "");
      if (!v.trim()) await companyName.fill("E2E Co");
      const headingBefore = "company";
      await page
        .getByRole("button", { name: /^continue$/i })
        .click()
        .catch(() => {});
      // Advance is async (POST /api/onboarding) — wait for the step to change off Company.
      await page
        .waitForFunction(
          () => !/your company/i.test(document.body.innerText),
          undefined,
          { timeout: 30_000 },
        )
        .catch(() => {});
      void headingBefore;
      continue;
    }

    // Data step: Skip advances synchronously (setStep), so the button detaches mid-click —
    // tolerate the detach and re-resolve next iteration. The last step's Skip routes to
    // the dashboard. Re-query fresh each pass (no stale handle).
    const skip = page.getByRole("button", { name: /skip this step/i });
    const cont = page.getByRole("button", { name: /continue|go to dashboard/i });
    if (await skip.isVisible().catch(() => false)) {
      await skip.click({ timeout: 5_000 }).catch(() => {});
    } else if (await cont.isVisible().catch(() => false)) {
      await cont.click({ timeout: 5_000 }).catch(() => {});
    } else {
      break;
    }
    // Brief settle for the synchronous step transition / final navigation.
    await page.waitForTimeout(400);
  }
  // Final CTA navigates to the dashboard.
  await page.waitForURL(/\/(dashboard|overview)/, { timeout: 30_000 }).catch(() => {});
}

test("artifact E2E: onboarding + dashboard action", async ({ page }) => {
  test.skip(
    CRED_PATH === "ui" && !OPENROUTER_KEY,
    "ui cred-path needs OPENROUTER_API_KEY",
  );

  await page.goto("/"); // auto-login → /onboarding (WebsiteStep), or dashboard if onboarded.
  await dismissCookieConsent(page);

  // If we're already onboarded (re-run against a dirty env), skip straight to the action.
  const onboarding = /\/onboarding/.test(new URL(page.url()).pathname);
  if (onboarding) {
    // Enter the manual wizard (skips the AI website-enrich) → lands on the first step.
    await page.getByRole("button", { name: /i'll fill in manually/i }).click();

    if (CRED_PATH === "ui") {
      // Self-host first step is the AI-config step. Reach + use it.
      await expect(
        page.getByRole("heading", { name: /connect your ai/i }),
      ).toBeVisible({ timeout: 15_000 });
      await addProviderViaUi(page);
      // Advance off the AI-config step.
      await page.getByRole("button", { name: /^continue$/i }).click();
      await page.waitForLoadState("networkidle").catch(() => {});
    } else {
      // cli path: provider already present — just advance past the AI-config step.
      const cont = page.getByRole("button", { name: /^continue$/i });
      if (await cont.isVisible().catch(() => false)) {
        await cont.click();
        await page.waitForLoadState("networkidle").catch(() => {});
      }
    }

    await completeOnboarding(page);
  }

  await expect(page).toHaveURL(/\/(dashboard|overview)(\/|\?|$)/, { timeout: 30_000 });

  if (ACTION === "revenue") {
    await page.goto("/revenue");
    await dismissCookieConsent(page);
    await page.getByRole("button", { name: /add revenue stream/i }).first().click();
    const form = page.getByRole("dialog", { name: /add revenue stream/i });
    await expect(form).toBeVisible();
    await form.getByLabel("Revenue stream name").fill("E2E Smoke Stream");
    const created = page.waitForResponse(
      (res) =>
        res.url().includes("/api/revenue-streams") &&
        res.request().method() === "POST",
      { timeout: 20_000 },
    );
    await form.getByRole("button", { name: /^add stream$/i }).click();
    const createdRes = await created;
    expect(createdRes.status(), "revenue stream create must succeed").toBeLessThan(400);
    // Assert PERSISTENCE via the same scenario-aware API the page reads (page.request shares
    // the browser's auth + active-scenario cookies). Robust against the revenue dashboard's
    // RSC/SWR render timing — what matters is the row survived the write to the DB.
    await expect
      .poll(
        async () => {
          const res = await page.request.get("/api/revenue-streams");
          if (!res.ok()) return false;
          const body = (await res.json()) as unknown;
          const rows = Array.isArray(body)
            ? body
            : ((body as { data?: unknown[] }).data ?? []);
          return rows.some(
            (r) => (r as { name?: string }).name === "E2E Smoke Stream",
          );
        },
        { timeout: 20_000 },
      )
      .toBe(true);
  } else if (ACTION === "settings") {
    await page.goto("/settings");
    await dismissCookieConsent(page);
    const company = page.getByLabel("Company name");
    await expect(company).toBeVisible({ timeout: 15_000 });
    await company.fill("E2E Renamed Co");
    const saved = page.waitForResponse(
      (res) =>
        res.url().includes("/api/company") && res.request().method() === "PATCH",
      { timeout: 20_000 },
    );
    await page.getByRole("button", { name: /save changes/i }).click();
    const savedRes = await saved;
    expect(savedRes.status(), "company rename must succeed").toBeLessThan(400);
    await page.reload();
    await dismissCookieConsent(page);
    await expect(page.getByLabel("Company name")).toHaveValue("E2E Renamed Co", {
      timeout: 15_000,
    });
  } else {
    // chat — live OpenRouter round-trip (cli path configured the provider; ui path just did).
    await page.goto("/ai");
    await dismissCookieConsent(page);
    const composer = page.getByRole("textbox", { name: /message/i });
    await expect(composer).toBeVisible({ timeout: 15_000 });
    await composer.fill("In one short sentence, what is runway?");
    await composer.press("Enter");
    // The user bubble already says "runway"; a real assistant reply makes a SECOND match.
    // Generous timeout for the model round-trip.
    await expect
      .poll(async () => page.getByText(/runway/i).count(), { timeout: 120_000 })
      .toBeGreaterThanOrEqual(2);
  }
});
