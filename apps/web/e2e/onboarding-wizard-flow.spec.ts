// apps/web/e2e/onboarding-wizard-flow.spec.ts
//
// S4b (Phase F, Task 15) — end-to-end happy path for the manual onboarding
// wizard. The wizard only renders for a user with NO company: the
// /onboarding server guard (onboarding/layout.tsx, ONB-01) redirects an
// already-onboarded user to /dashboard before the wizard mounts. The shared
// authed session (demo@burnless.app) HAS a company, so this spec deliberately
// does NOT reuse e2e/.auth/user.json — it registers a fresh, company-less user
// and signs it in inline.
//
// Flow covered:
//   /onboarding → skip AI ("I'll fill in manually")
//   → Company step: enter name → Continue (creates the company)
//   → Revenue step: add ONE real revenue stream via the live RevenueStreamForm
//   → Funding / Expenses / Team: Skip this step
//   → Team is last → "Go to dashboard"
//   → assert landing on /dashboard
import { test, expect } from "@playwright/test";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const postgres = require("postgres") as typeof import("postgres")["default"];

test.describe("Onboarding wizard — manual happy path (S4b)", () => {
  // No storageState: this test owns its own fresh, company-less user.
  // The flow spans register → sign-in → 5 wizard steps, so it needs more than
  // the 30s default; and `networkidle` is unreliable here (SWR polling keeps
  // the network busy), so navigations wait on `domcontentloaded`.
  test.setTimeout(120_000);
  test("walks the manual wizard and lands on the dashboard", async ({
    page,
  }) => {
    test.skip(!process.env.DATABASE_URL, "Requires DATABASE_URL");

    const email = `e2e-onboarding-${Date.now()}@burnless-test.com`;
    const password = "TestPassword1";
    const sql = postgres(process.env.DATABASE_URL!);

    try {
      // 1) Register a fresh user (no company → wizard will render).
      //    The production build (`pnpm start`) enforces the CSRF origin
      //    allowlist on mutations, so send an explicit Origin matching
      //    NEXT_PUBLIC_APP_URL (defaults to the playwright baseURL).
      const appOrigin =
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.BASE_URL ||
        "http://localhost:3000";
      const registerRes = await page.request.post("/api/auth/register", {
        data: { email, password, name: "Wizard Tester" },
        headers: { origin: appOrigin },
      });
      expect(
        registerRes.status(),
        "fresh registration should succeed",
      ).toBe(201);

      // 2) Mark the email verified (mirrors auth.setup.ts — credentials login
      //    is smoother for a verified account).
      await sql`
        UPDATE users SET email_verified = NOW() WHERE email = ${email}
      `;
    } finally {
      await sql.end();
    }

    // 3) Sign in via the login UI (same selectors as auth.setup.ts).
    await page.goto("/login", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.getByPlaceholder("you@startup.com").fill(email);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible({ timeout: 10_000 });
    await page.getByPlaceholder("Enter your password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();

    // A company-less user is redirected to /onboarding after sign-in.
    await page.waitForURL(/\/onboarding|\/dashboard/, { timeout: 20_000 });

    // 4) Ensure we are on the onboarding wizard's website step.
    await page.goto("/onboarding");
    await expect(
      page.getByRole("button", { name: /set up my company/i }),
    ).toBeVisible({ timeout: 15_000 });

    // 5) Skip AI enrichment → drop straight into the wizard (manual path).
    await page.getByRole("button", { name: /i'll fill in manually/i }).click();

    // 6) Company step — the only step that creates the company.
    await expect(
      page.getByRole("heading", { name: "Your company" }),
    ).toBeVisible({ timeout: 15_000 });

    const companyName = `Wizard Co ${Date.now()}`;
    await page.getByLabel("Company name").fill(companyName);

    // The slim onboarding POST creates company + base scenario + accounts.
    const createCompany = page.waitForResponse(
      (res) =>
        res.url().includes("/api/onboarding") &&
        res.request().method() === "POST",
      { timeout: 20_000 },
    );
    await page.getByTestId("company-continue").click();
    const createRes = await createCompany;
    expect(
      createRes.status(),
      "company creation must succeed",
    ).toBeLessThan(400);

    // 7) Revenue step — add ONE real revenue stream through the live form.
    await expect(
      page.getByRole("heading", { name: "Revenue", exact: true }),
    ).toBeVisible({ timeout: 15_000 });

    await page
      .getByRole("button", { name: /add a revenue stream/i })
      .click();

    // The RevenueStreamForm is now mounted (aria-label="Add revenue stream").
    await page
      .getByLabel("Revenue stream name")
      .fill(`Pro Plan ${Date.now()}`);

    // Persist the stream — assert the POST is a 2xx (the company exists now).
    const createStream = page.waitForResponse(
      (res) =>
        res.url().includes("/api/revenue-streams") &&
        res.request().method() === "POST",
      { timeout: 20_000 },
    );
    await page.getByRole("button", { name: /^add stream$/i }).click();
    const streamRes = await createStream;
    expect(
      streamRes.status(),
      "revenue stream creation must succeed",
    ).toBeLessThan(400);

    // Back on the Revenue list, the saved stream is shown.
    await expect(
      page.getByRole("heading", { name: "Revenue", exact: true }),
    ).toBeVisible({ timeout: 15_000 });

    // 8) Funding → Skip this step.
    await page.getByRole("button", { name: /skip this step/i }).click();
    await expect(
      page.getByRole("heading", { name: "Funding & cap table", exact: true }),
    ).toBeVisible({ timeout: 15_000 });

    // 9) Expenses → Skip this step.
    await page.getByRole("button", { name: /skip this step/i }).click();
    await expect(
      page.getByRole("heading", { name: "Expenses", exact: true }),
    ).toBeVisible({ timeout: 15_000 });

    // 10) Team (last step) → Skip this step.
    await page.getByRole("button", { name: /skip this step/i }).click();
    await expect(
      page.getByRole("heading", { name: "Team", exact: true }),
    ).toBeVisible({ timeout: 15_000 });

    // 11) Finish — the last step's primary CTA reads "Go to dashboard".
    await page
      .getByRole("button", { name: /go to dashboard/i })
      .click();

    // 12) Assert we land on the dashboard.
    await expect(page).toHaveURL(/\/dashboard(\/|\?|$)/, {
      timeout: 20_000,
    });
  });
});
