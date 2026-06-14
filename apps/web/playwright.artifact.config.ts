import { defineConfig, devices } from "@playwright/test";

// Drives an EXTERNAL, already-running burnless artifact (BASE_URL). No webServer, no auth
// setup — the self-host artifact auto-logs-in. Used by the acceptance matrix (Task 11).
export default defineConfig({
  testDir: "./e2e",
  testMatch: /artifact-e2e\.spec\.ts/,
  timeout: 180_000, // live OpenRouter calls + onboarding enrich; generous for qemu envs
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://127.0.0.1:2876",
    headless: true,
    trace: "retain-on-failure",
  },
  projects: [{ name: "artifact", use: { ...devices["Desktop Chrome"] } }],
});
