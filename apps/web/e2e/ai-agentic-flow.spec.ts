import { test, expect } from "@playwright/test";

// Drives LIVE LLM turns (founder-chosen). Skips without a provider; tolerant of
// model variance (gemma is slow + may or may not plan). Requires DATABASE_URL +
// a seeded test account.
const ready = !!process.env.DATABASE_URL && !!process.env.AI_PROVIDER;

test.describe("AI agentic flow — plan gate → diff-gate → apply → reload", () => {
  test.skip(!ready, "Requires DATABASE_URL + AI_PROVIDER");
  test.use({ storageState: "e2e/.auth/user.json" });

  // Base-view reset (S3): /api/chat now dual-channel-validates the scenario cookie
  // vs the X-Scenario-Id header. Clear any leftover cookie from a prior spec so the
  // first message isn't 409'd by a stale sandbox cookie.
  test.beforeEach(async ({ page }) => {
    await page.goto("/ai");
    await page.evaluate(() => {
      document.cookie = "active-scenario-id=; Path=/; Max-Age=0";
      try { sessionStorage.removeItem("active-scenario"); } catch { /* ignore */ }
    });
  });

  test("a read answers directly with NO plan card", async ({ page }) => {
    await page.goto("/ai");
    const input = page.getByPlaceholder(/ask/i).first();
    await input.fill("What is my current runway?");
    await input.press("Enter");
    // A result (component or prose) appears; the plan card must NOT.
    await expect(page.getByRole("button", { name: /^Proceed$/ })).toHaveCount(0, { timeout: 30_000 });
  });

  test("a write goes plan gate → diff/permission gate → apply", async ({ page }) => {
    await page.goto("/ai");
    const input = page.getByPlaceholder(/ask/i).first();
    await input.fill("Create a revenue stream called Agentic QA, subscription, $1000/mo, starting next month.");
    await input.press("Enter");

    // The model SHOULD plan first; if it does, proceed. Tolerant: skip if absent.
    const proceed = page.getByRole("button", { name: /^Proceed$/ });
    if (await proceed.isVisible({ timeout: 30_000 }).catch(() => false)) {
      await proceed.click();
    }

    // The write pauses at the diff/permission gate (confirm default).
    const allow = page.getByRole("button", { name: /allow once|apply/i }).first();
    await expect(allow).toBeVisible({ timeout: 40_000 });
    await allow.click();

    // The turn resumes/completes (the gate resolves).
    await expect(page.getByText(/created|resolved|started|done/i).first()).toBeVisible({ timeout: 40_000 });
  });

  test("creating a scenario activates it — the top scenario bar appears", async ({ page }) => {
    await page.goto("/ai");
    const input = page.getByPlaceholder(/ask/i).first();
    await input.fill("Create a scenario called Agentic Activation QA.");
    await input.press("Enter");

    // Plan/permission gate may appear — approve whatever gate shows.
    const proceed = page.getByRole("button", { name: /^Proceed$/ });
    if (await proceed.isVisible({ timeout: 30_000 }).catch(() => false)) await proceed.click();
    const allow = page.getByRole("button", { name: /allow once|apply/i }).first();
    if (await allow.isVisible({ timeout: 40_000 }).catch(() => false)) await allow.click();

    // The scenario bar (amber banner) appears with the scenario name.
    await expect(page.getByText(/SCENARIO:\s*Agentic Activation QA/i)).toBeVisible({ timeout: 40_000 });
    // Clean up: exit the scenario so the session storageState isn't left in a sandbox.
    await page.getByRole("button", { name: /^Exit$/ }).click().catch(() => {});
  });
});
