import { test as setup, expect } from "@playwright/test";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const postgres = require("postgres") as typeof import("postgres")["default"];

/**
 * Auth setup — ensures the demo user has a password and is verified,
 * then signs in via the login UI to capture the session cookies.
 *
 * Uses the seeded demo user (demo@burnless.app) so that authenticated
 * tests have access to the full seeded dataset (company, scenarios,
 * accounts, transactions, etc.).
 *
 * Requires DATABASE_URL to be set. Skipped otherwise.
 */

const AUTH_FILE = "e2e/.auth/user.json";

const DEMO_USER = {
  email: "demo@burnless.app",
  password: "TestPassword1",
};

setup("authenticate test user", async ({ page }) => {
  setup.skip(!process.env.DATABASE_URL, "Requires DATABASE_URL");

  const sql = postgres(process.env.DATABASE_URL!);

  try {
    // Set password and ensure email is verified on the demo user.
    // The seed creates this user without a password, so we add one
    // for credentials-based E2E testing.
    // hashPassword uses bcrypt — we need to hash via the app's API instead.
    // Simpler: register a fresh test user and associate them with the demo company.

    // Actually the cleanest approach: Register via API to get proper password hash,
    // then if the demo user already exists (409), manually set the password hash
    // by registering a temp user and copying the hash.

    // First try to register the demo user (will 409 since seed created it)
    const registerRes = await page.request.post("/api/auth/register", {
      data: { email: DEMO_USER.email, password: DEMO_USER.password, name: "Alex Chen" },
    });

    if (registerRes.status() === 409) {
      // User exists (from seed). Register a temp user to get a valid hash.
      const tempEmail = `e2e-temp-${Date.now()}@burnless-test.com`;
      const tempRes = await page.request.post("/api/auth/register", {
        data: { email: tempEmail, password: DEMO_USER.password, name: "Temp" },
      });

      if (tempRes.status() === 201) {
        // Copy the password hash from temp user to demo user
        await sql`
          UPDATE users
          SET password_hash = (SELECT password_hash FROM users WHERE email = ${tempEmail})
          WHERE email = ${DEMO_USER.email}
        `;

        // Clean up temp user
        await sql`DELETE FROM users WHERE email = ${tempEmail}`;
      }
    }

    // Ensure email is verified
    await sql`
      UPDATE users
      SET email_verified = NOW()
      WHERE email = ${DEMO_USER.email}
        AND email_verified IS NULL
    `;
  } finally {
    await sql.end();
  }

  // Sign in via the login UI (allow extra time for dev server compilation)
  await page.goto("/login", { waitUntil: "networkidle", timeout: 30_000 });
  await expect(page.getByText("Welcome to Burnless")).toBeVisible({ timeout: 15_000 });

  await page.getByPlaceholder("you@startup.com").fill(DEMO_USER.email);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByRole("heading", { name: "Welcome back" })
  ).toBeVisible({ timeout: 10_000 });

  await page.getByPlaceholder("Enter your password").fill(DEMO_USER.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Wait for redirect to dashboard (or onboarding if no company)
  await page.waitForURL(/\/dashboard|\/onboarding/, { timeout: 15_000 });

  // Save authenticated session
  await page.context().storageState({ path: AUTH_FILE });
});
