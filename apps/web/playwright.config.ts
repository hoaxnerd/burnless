import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E test configuration for burnless web app.
 *
 * Runs against the local dev server by default.
 * Set BASE_URL env var to test against a deployed instance.
 */
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: process.env.CI ? "github" : "list",
  timeout: 30_000,

  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    // Auth setup — registers & signs in a test user, saves session cookies.
    // Only runs when DATABASE_URL is set (skipped internally otherwise).
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },

    // Default project — runs all non-auth tests (smoke, UI, mobile audit).
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /auth\.setup\.ts/,
    },

    // Authenticated project — tests that need a logged-in session.
    // Depends on "setup" so session cookies exist before tests run.
    // Tests that use `test.use({ storageState: "e2e/.auth/user.json" })`
    // get the pre-authenticated context automatically.
    {
      name: "authenticated",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
      testMatch: /critical-user-flows\.spec\.ts|sidebar-floating\.spec\.ts|data-room-hub\.spec\.ts|edit-delete-entries\.spec\.ts|ai-ux\.spec\.ts|comprehensive-crud\.spec\.ts|scenario-isolation\.spec\.ts|scenario-overlay\.spec\.ts|scenario-promotion\.spec\.ts|scenario-comparison\.spec\.ts|scenario-ai\.spec\.ts|scenario-edge-cases\.spec\.ts|settings-wiring\.spec\.ts|dashboard-features\.spec\.ts|dashboard-cards\.spec\.ts|dashboard-rearrange\.spec\.ts|dashboard-catalog\.spec\.ts|expense-flows\.spec\.ts|team-flows\.spec\.ts|revenue-stream-flows\.spec\.ts|funding-flows\.spec\.ts/,
    },
  ],

  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "pnpm build && pnpm start",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
