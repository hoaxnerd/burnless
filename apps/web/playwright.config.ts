import { defineConfig, devices } from "@playwright/test";
import fs from "fs";
import path from "path";

/**
 * Playwright E2E test configuration for burnless web app.
 *
 * Runs against the local dev server by default.
 * Set BASE_URL env var to test against a deployed instance.
 */

// ── .env loader ─────────────────────────────────────────────────────────────
//
// Playwright doesn't auto-load `.env` files, and we deliberately avoid adding a
// `dotenv` dependency just for this — its surface is tiny (KEY=value lines with
// optional surrounding quotes) and the failure mode (missing var) is loud.
// Anything not in `apps/web/.env` must be set in the shell or passed via CI.
function loadDotenv(envPath: string) {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf-8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const sep = line.indexOf("=");
    if (sep <= 0) continue;
    const key = line.slice(0, sep).trim();
    let val = line.slice(sep + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
loadDotenv(path.resolve(__dirname, ".env"));

// AUTH_SECRET must come from the developer's `.env` or CI secrets. If it is
// genuinely missing we fail-fast here rather than baking a literal secret into
// the repo — leaked test secrets get reused, and pattern scanners flag them.
const AUTH_SECRET = process.env.AUTH_SECRET;
if (!AUTH_SECRET && !process.env.BASE_URL) {
  throw new Error(
    "AUTH_SECRET is not set. Add it to apps/web/.env or export it before running playwright.",
  );
}

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
      testMatch: /critical-user-flows\.spec\.ts|sidebar-floating\.spec\.ts|data-room-hub\.spec\.ts|edit-delete-entries\.spec\.ts|ai-ux\.spec\.ts|comprehensive-crud\.spec\.ts|scenario-isolation\.spec\.ts|scenario-overlay\.spec\.ts|scenario-promotion\.spec\.ts|scenario-comparison\.spec\.ts|scenario-ai\.spec\.ts|scenario-edge-cases\.spec\.ts|settings-wiring\.spec\.ts|dashboard-features\.spec\.ts|dashboard-cards\.spec\.ts|dashboard-rearrange\.spec\.ts|dashboard-catalog\.spec\.ts|expense-flows\.spec\.ts|team-flows\.spec\.ts|revenue-stream-flows\.spec\.ts|funding-flows\.spec\.ts|scenario-realtime\.spec\.ts|scenario-delete-uniform\.spec\.ts|ai-permissions\.spec\.ts|ai-generative-ui\.spec\.ts|ai-agentic-flow\.spec\.ts|funding-create\.spec\.ts|empty-states\.spec\.ts|onboarding-redirect-guard\.spec\.ts|funding-import-mapstep\.spec\.ts|scenario-active-delete\.spec\.ts|post-mutation-revalidate\.spec\.ts|mcp-connections\.spec\.ts|mcp-expose\.spec\.ts/,
    },
  ],

  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "pnpm build && pnpm start",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          DATABASE_URL: process.env.DATABASE_URL || "",
          NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
          AUTH_SECRET: AUTH_SECRET ?? "",
          // Rate-limit bypass is hard-gated to non-production in middleware.ts
          // and api-rate-limit.ts — safe to set unconditionally here.
          DISABLE_RATE_LIMIT: "true",
        },
      },
});
