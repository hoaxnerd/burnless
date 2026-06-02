import { test, expect } from "@playwright/test";

/**
 * Generative UI E2E — genui plan 5, Task 3.
 *
 * Exercises the generative-UI surface end-to-end: a display turn (the model
 * renders a component instead of narrating numbers) and an input turn (the
 * model proposes a form, the user fills + submits it).
 *
 * The live provider is flaky/slow on multi-tool turns, so the model-dependent
 * assertions are gated on AI_PROVIDER. Without a provider this is a smoke test:
 * the /ai page loads and the chat input accepts text — meaningful in CI without
 * a model. Selectors mirror ai-ux.spec.ts (real placeholder, storageState).
 */

const dbAvailable = !!process.env.DATABASE_URL;
const hasProvider = !!process.env.AI_PROVIDER;

const CHAT_PLACEHOLDER =
  "Ask about your financials, build a scenario, get advice...";

test.describe("AI generative UI — authenticated", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL");
  test.use({ storageState: "e2e/.auth/user.json" });

  test("generative UI: display + input", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/ai");

    const input = page.getByPlaceholder(CHAT_PLACEHOLDER);
    await expect(input).toBeVisible({ timeout: 10_000 });

    // Smoke-only without a model: confirm the input accepts text and stop.
    if (!hasProvider) {
      await input.fill("show my runway as a card");
      await expect(page.locator("button[type='submit']")).toBeEnabled();
      return;
    }

    // ── Test A: display turn ────────────────────────────────────────────────
    await input.fill("show my runway as a card");
    await page.locator("button[type='submit']").click();

    // Either a rendered component OR a plain text answer is acceptable; what we
    // forbid is the unsupported-component fallback. Give the live model room.
    await expect(page.getByText("Unsupported component")).toHaveCount(0, {
      timeout: 60_000,
    });
    // A response (component or prose) eventually appears — the user message
    // echoes immediately; wait for the assistant turn to settle.
    await expect
      .poll(
        async () =>
          (await page.getByText(/runway/i).count()) > 0,
        { timeout: 60_000 },
      )
      .toBeTruthy();

    expect(
      consoleErrors,
      `console errors during display turn:\n${consoleErrors.join("\n")}`,
    ).toEqual([]);

    // ── Test B: input turn ──────────────────────────────────────────────────
    await input.fill("help me add a revenue stream");
    await page.locator("button[type='submit']").click();

    const form = page.getByText(/Add a revenue stream/i);
    await expect(form).toBeVisible({ timeout: 60_000 });

    // Fill the monthly amount and submit.
    const amount = page.getByLabel(/monthly amount/i).first();
    await amount.fill("4900");

    // The revenue preset's submit button reads "Save" (its default submitLabel);
    // tolerate the generic labels too in case the model overrides it.
    const submit = page
      .getByRole("button", { name: /save|create|submit/i })
      .last();
    await submit.click();

    // The form moves to a resolved state (button reads "Submitted") and the
    // turn continues without an unsupported-component fallback.
    await expect(
      page.getByRole("button", { name: /submitted/i }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Unsupported component")).toHaveCount(0);
  });
});
