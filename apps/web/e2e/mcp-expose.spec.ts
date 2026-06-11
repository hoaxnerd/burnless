// apps/web/e2e/mcp-expose.spec.ts
//
// MCP expose e2e (expose spec §8): Your MCP tab → mint a PAT through the
// modal (configure → shown-once), see it in the table, revoke it (two-click),
// and flip the kill switch off/on (restored — shared e2e DB).
import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/user.json" });

// Seed cookie consent before any page script runs (consent banner is
// role="dialog" and intercepts clicks otherwise — documented pattern from
// mcp-connections.spec.ts).
test.beforeEach(async ({ page }) => {
  // This spec mints/revokes tokens and toggles the company kill switch — mutating,
  // shared-company state. The default "chromium" project (testIgnore-based) also
  // picks it up via the saved storageState and would race the "authenticated"
  // project in parallel on the same company. Pin it to its registered project
  // (playwright.config projects[2]); test.info() reliably exposes the project name.
  test.skip(
    test.info().project.name !== "authenticated",
    "expose flows run only in the authenticated project (shared mutating state)",
  );
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "burnless-cookie-consent",
      JSON.stringify({
        version: "1",
        preferences: { essential: true, analytics: false, marketing: false },
        timestamp: Date.now(),
      }),
    );
  });
});

const TOKEN_NAME = `e2etok${Date.now()}p${process.pid % 100000}`;

test.describe("Your MCP tab", () => {
  test("mint token (shown once) → listed → revoke", async ({ page }) => {
    await page.goto("/connections");
    await page.getByRole("radio", { name: "Your MCP" }).click();

    // endpoint card is up
    await expect(page.getByText("Burnless MCP server")).toBeVisible();

    // configure state
    await page.getByRole("button", { name: "New token" }).click();
    const dialog = page.getByRole("dialog", { name: "New access token" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(/Token name/i).fill(TOKEN_NAME);
    // read is pre-checked; also grant write
    await dialog.getByRole("checkbox", { name: "Write scope" }).click();
    await dialog.getByRole("button", { name: "Create token" }).click();

    // shown-once state
    const created = page.getByRole("dialog", { name: "Token created" });
    await expect(created).toBeVisible();
    await expect(created.getByText(/shown only once/i)).toBeVisible();
    await expect(created.getByText(/^bl_pat_/)).toBeVisible();
    await expect(created.getByText(/We store only a hash/i)).toBeVisible();
    await created.getByRole("button", { name: "Done" }).click();

    // listed with mask + scopes
    const row = page.locator("tr", { hasText: TOKEN_NAME });
    await expect(row).toBeVisible();
    await expect(row.getByText(/^bl_pat_••••/)).toBeVisible();
    await expect(row.getByText("read", { exact: true })).toBeVisible();
    await expect(row.getByText("write", { exact: true })).toBeVisible();

    // two-click revoke
    await row.getByRole("button", { name: `Revoke token ${TOKEN_NAME}` }).click();
    await row.getByRole("button", { name: `Confirm revoke ${TOKEN_NAME}` }).click();
    await expect(page.locator("tr", { hasText: TOKEN_NAME })).toHaveCount(0);
  });

  test("kill switch toggles off and back on", async ({ page }) => {
    await page.goto("/connections");
    await page.getByRole("radio", { name: "Your MCP" }).click();

    const killSwitch = page.getByRole("switch", { name: "External agent access" });
    await expect(killSwitch).toBeVisible();
    await expect(killSwitch).toHaveAttribute("aria-checked", "true");

    await killSwitch.click();
    await expect(killSwitch).toHaveAttribute("aria-checked", "false");
    await expect(page.getByText("Disabled", { exact: true })).toBeVisible();

    // restore — the e2e database is shared with other specs
    await killSwitch.click();
    await expect(killSwitch).toHaveAttribute("aria-checked", "true");
  });
});
