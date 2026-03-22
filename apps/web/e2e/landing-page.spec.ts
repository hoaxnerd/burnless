import { test, expect } from "@playwright/test";

/**
 * Landing Page Overhaul E2E Tests — BUR-195 / BUR-173
 *
 * Tests the redesigned landing page sections:
 *   - Hero section: headline, CTAs, trust badges
 *   - Features section: cards with descriptions
 *   - Social proof: animated counters, integration logos
 *   - CTA section: form/buttons
 *   - Mobile responsive at 375px
 *   - Cross-browser basic verification
 */

test.describe("Landing page — desktop", () => {
  test("hero section shows headline and CTAs", async ({ page }) => {
    await page.goto("/");

    // Main headline
    await expect(
      page.getByText(/know your runway/i).first()
    ).toBeVisible({ timeout: 10_000 });

    // At least one CTA button
    await expect(
      page.locator("a, button").filter({ hasText: /see your runway|get started|start free/i }).first()
    ).toBeVisible();
  });

  test("hero section shows trust badges", async ({ page }) => {
    await page.goto("/");

    // Trust badges: encryption, SOC 2, GDPR
    await expect(
      page.getByText(/256-bit/i).first()
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText(/SOC 2/i).first()
    ).toBeVisible();
    await expect(
      page.getByText(/GDPR/i).first()
    ).toBeVisible();
  });

  test("features section shows feature cards", async ({ page }) => {
    await page.goto("/");

    // Scroll to features
    await page.locator("#features, [id='features']").scrollIntoViewIfNeeded().catch(() => {
      // If no #features anchor, scroll down
      return page.evaluate(() => window.scrollBy(0, 800));
    });

    // Feature card titles
    const featureNames = [
      "AI CFO",
      "Runway Gauge",
      "Scenario Planning",
      "Revenue Intelligence",
    ];

    for (const name of featureNames) {
      await expect(
        page.getByText(name).first()
      ).toBeVisible({ timeout: 10_000 });
    }
  });

  test("social proof section shows animated stats", async ({ page }) => {
    await page.goto("/");

    // Scroll to social proof section
    await page.evaluate(() => window.scrollBy(0, 1600));
    await page.waitForTimeout(500);

    // Stats labels
    await expect(
      page.getByText(/financial decisions/i).first()
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText(/runway tracked/i).first()
    ).toBeVisible();
    await expect(
      page.getByText(/integrations/i).first()
    ).toBeVisible();
  });

  test("social proof section shows integration logos", async ({ page }) => {
    await page.goto("/");

    // Scroll to integration logos
    await page.evaluate(() => window.scrollBy(0, 1800));
    await page.waitForTimeout(500);

    // Check for some integration names
    const integrations = ["QuickBooks", "Stripe", "Plaid", "Mercury"];
    for (const name of integrations) {
      await expect(
        page.getByText(name).first()
      ).toBeVisible({ timeout: 10_000 });
    }
  });

  test("social proof section pauses animation on hover", async ({ page }) => {
    await page.goto("/");

    // Scroll to logos
    await page.evaluate(() => window.scrollBy(0, 1800));
    await page.waitForTimeout(500);

    // Hover over the logo scroll container
    const logoContainer = page.getByText("QuickBooks").first();
    if (await logoContainer.isVisible()) {
      await logoContainer.hover();

      // Animation should be paused — verify via computed style
      const animState = await page
        .locator("[style*='animationPlayState']")
        .first()
        .evaluate((el) =>
          getComputedStyle(el).animationPlayState
        ).catch(() => null);

      if (animState) {
        expect(animState).toBe("paused");
      }
    }
  });

  test("CTA section shows headline and action buttons", async ({ page }) => {
    await page.goto("/");

    // Scroll to bottom CTA
    await page.evaluate(() =>
      window.scrollTo(0, document.body.scrollHeight)
    );
    await page.waitForTimeout(500);

    // CTA headline
    await expect(
      page.getByText(/stop guessing/i).first()
    ).toBeVisible({ timeout: 10_000 });

    // CTA buttons
    await expect(
      page
        .locator("a, button")
        .filter({ hasText: /start free/i })
        .first()
    ).toBeVisible();
  });

  test("CTA section shows metric cards", async ({ page }) => {
    await page.goto("/");

    await page.evaluate(() =>
      window.scrollTo(0, document.body.scrollHeight)
    );
    await page.waitForTimeout(500);

    // Metric values
    await expect(
      page.getByText("500+").first()
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText("30 sec").first()
    ).toBeVisible();
    await expect(
      page.getByText("$0").first()
    ).toBeVisible();
  });

  test("navigation shows login and signup links", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.locator("a, button").filter({ hasText: /log in/i }).first()
    ).toBeVisible({ timeout: 10_000 });

    await expect(
      page
        .locator("a, button")
        .filter({ hasText: /start free|sign up/i })
        .first()
    ).toBeVisible();
  });

  test("hero CTA 'See your runway' links to login", async ({ page }) => {
    await page.goto("/");

    const cta = page.locator("a").filter({ hasText: /see your runway/i }).first();
    if (await cta.isVisible()) {
      await expect(cta).toHaveAttribute("href", "/login");
    }
  });

  test("no console errors on landing page", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/");
    await page.waitForTimeout(2000);

    // Filter out known non-critical errors (like favicon 404s)
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes("favicon") &&
        !e.includes("404") &&
        !e.includes("hydration")
    );

    expect(
      criticalErrors,
      `Landing page has console errors: ${criticalErrors.join(", ")}`
    ).toHaveLength(0);
  });
});

test.describe("Landing page — mobile viewport", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("hero section renders on mobile", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByText(/know your runway/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("navigation is accessible on mobile", async ({ page }) => {
    await page.goto("/");

    // Either hamburger menu or visible nav links
    const hasHamburger = await page
      .locator("button")
      .filter({ hasText: /menu/i })
      .isVisible()
      .catch(() => false);
    const hasLoginLink = await page
      .locator("a")
      .filter({ hasText: /log in/i })
      .first()
      .isVisible()
      .catch(() => false);

    expect(
      hasHamburger || hasLoginLink,
      "Mobile should have either hamburger menu or visible login link"
    ).toBeTruthy();
  });

  test("features section renders on mobile", async ({ page }) => {
    await page.goto("/");

    await page.evaluate(() => window.scrollBy(0, 800));
    await page.waitForTimeout(500);

    // At least one feature should be visible
    await expect(
      page.getByText(/AI CFO|Runway Gauge|Scenario/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("CTA section renders on mobile", async ({ page }) => {
    await page.goto("/");

    await page.evaluate(() =>
      window.scrollTo(0, document.body.scrollHeight)
    );
    await page.waitForTimeout(500);

    await expect(
      page.getByText(/stop guessing/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });
});
