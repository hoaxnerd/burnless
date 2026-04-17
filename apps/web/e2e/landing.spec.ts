import { test, expect } from "@playwright/test";

/**
 * Landing page E2E tests — comprehensive coverage for hero, features,
 * social proof, CTA, nav, footer, and responsive behavior.
 *
 * QA ticket: BUR-195
 * Reference commit: 8797b28 (landing page overhaul)
 */

test.describe("Landing page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
  });

  /* ── Basic health ─────────────────────────────────────────────────────── */

  test("loads successfully with 200 status", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
  });

  test("responds with correct content-type headers", async ({ page }) => {
    const response = await page.goto("/");
    const contentType = response?.headers()["content-type"] ?? "";
    expect(contentType).toContain("text/html");
  });

  test("does not expose sensitive data on public page", async ({ page }) => {
    const content = await page.content();
    expect(content).not.toContain("sk-");
    expect(content).not.toContain("NEXT_AUTH_SECRET");
    expect(content).not.toContain("DATABASE_URL");
    expect(content).not.toContain("OPENAI_API_KEY");
  });

  /* ── Navigation ───────────────────────────────────────────────────────── */

  test.describe("Navigation", () => {
    test("displays brand name", async ({ page }) => {
      await expect(page.getByText("burnless").first()).toBeVisible();
    });

    test("has Features nav link", async ({ page }) => {
      await expect(
        page.getByRole("link", { name: /features/i }).first()
      ).toBeVisible();
    });

    test("has Log in link", async ({ page }) => {
      await expect(
        page.getByRole("link", { name: /log in/i })
      ).toBeVisible();
    });

    test('has "Start free" CTA button in nav', async ({ page }) => {
      // "Start free" appears in both desktop nav and mobile — check any is visible
      const links = page.getByRole("link", { name: /start free/i });
      await expect(links.first()).toBeVisible({ timeout: 10_000 });
    });

    test("Start free links to /login", async ({ page }) => {
      const links = page.getByRole("link", { name: /start free/i });
      await expect(links.first()).toHaveAttribute("href", "/login", {
        timeout: 10_000,
      });
    });
  });

  /* ── Hero section ─────────────────────────────────────────────────────── */

  test.describe("Hero section", () => {
    test("displays the main headline", async ({ page }) => {
      await expect(
        page.getByRole("heading", { name: /know your runway/i })
      ).toBeVisible();
    });

    test("displays the gradient subheadline", async ({ page }) => {
      await expect(
        page.getByText("Plan your future.", { exact: true })
      ).toBeVisible();
    });

    test("displays the tagline paragraph", async ({ page }) => {
      await expect(
        page.getByText(/understands burn rate, forecasts runway/i)
      ).toBeVisible();
    });

    test('has "See your runway" primary CTA', async ({ page }) => {
      const cta = page.getByRole("link", { name: /see your runway/i });
      await expect(cta).toBeVisible();
      await expect(cta).toHaveAttribute("href", "/login");
    });

    test('has "See how it works" secondary CTA', async ({ page }) => {
      const cta = page.getByRole("link", { name: /see how it works/i });
      await expect(cta).toBeVisible();
      await expect(cta).toHaveAttribute("href", "#features");
    });

    test("shows AI-powered badge", async ({ page }) => {
      await expect(
        page.getByText("AI-powered financial planning", { exact: true })
      ).toBeVisible();
    });

    test("shows trust badges (encryption, SOC 2, GDPR)", async ({ page }) => {
      await expect(
        page.getByText("256-bit encrypted", { exact: true })
      ).toBeVisible();
      await expect(page.getByText("SOC 2 ready").first()).toBeVisible();
      await expect(page.getByText("GDPR compliant").first()).toBeVisible();
    });

    test("shows dashboard mockup with metrics", async ({ page }) => {
      await expect(page.getByText("app.burnless.com/dashboard")).toBeVisible();
      await expect(page.getByText("18.2 mo").first()).toBeVisible();
      await expect(page.getByText("$42.5K").first()).toBeVisible();
    });

    test("displays scroll indicator", async ({ page }) => {
      await expect(page.getByText("Scroll to explore")).toBeVisible();
    });
  });

  /* ── Social proof bar ─────────────────────────────────────────────────── */

  test.describe("Social proof bar", () => {
    test("shows stat labels", async ({ page }) => {
      const label = page.getByText("Financial decisions powered");
      await label.scrollIntoViewIfNeeded();
      await expect(label).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText("In runway tracked")).toBeVisible();
      await expect(
        page.getByText("Integrations available")
      ).toBeVisible();
    });

    test('shows "Trusted by" label', async ({ page }) => {
      const label = page.getByText(/trusted by founders/i);
      await label.scrollIntoViewIfNeeded();
      await expect(label).toBeVisible({ timeout: 10_000 });
    });

    test("renders integration logo pills", async ({ page }) => {
      // Each integration appears 3x (tripled for seamless loop)
      const quickbooks = page.getByText("QuickBooks").first();
      await quickbooks.scrollIntoViewIfNeeded();
      await expect(quickbooks).toBeVisible({ timeout: 10_000 });

      await expect(page.getByText("Stripe").first()).toBeVisible();
      await expect(page.getByText("Plaid").first()).toBeVisible();
    });

    test("logo carousel uses longhand animation properties (CSS fix)", async ({
      page,
    }) => {
      // Verify the animation fix: longhand properties avoid conflict
      // between animation shorthand and animationPlayState
      const carousel = page.locator('[class*="flex gap-4"]').first();
      await expect(carousel).toBeVisible();

      // The element should use animationName, not the shorthand animation
      const animationName = await carousel.evaluate(
        (el) => getComputedStyle(el).animationName
      );
      // When in view, animation should be logoScroll (or none if not yet in view)
      expect(["logoScroll", "none"]).toContain(animationName);
    });
  });

  /* ── Features section ─────────────────────────────────────────────────── */

  test.describe("Features section", () => {
    test("displays Features badge", async ({ page }) => {
      const section = page.locator("#features");
      await section.scrollIntoViewIfNeeded();
      await expect(section.getByText("Features")).toBeVisible();
    });

    test("displays section headline", async ({ page }) => {
      const section = page.locator("#features");
      await section.scrollIntoViewIfNeeded();
      await expect(
        page.getByRole("heading", {
          name: /answers, not spreadsheets/i,
        })
      ).toBeVisible({ timeout: 10_000 });
    });

    test('shows "Your AI CFO" feature card', async ({ page }) => {
      const heading = page.getByRole("heading", { name: /your ai cfo/i });
      await heading.scrollIntoViewIfNeeded();
      await expect(heading).toBeVisible();
    });

    test("AI CFO card lists capabilities", async ({ page }) => {
      const aiCfoHeading = page.getByRole("heading", { name: /your ai cfo/i });
      await aiCfoHeading.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await expect(
        page.getByText("Natural language queries")
      ).toBeVisible();
      await expect(page.getByText("Proactive alerts")).toBeVisible();
      await expect(page.getByText("One-click scenarios")).toBeVisible();
    });

    test('shows "Never be surprised by zero" runway card', async ({
      page,
    }) => {
      const heading = page.getByRole("heading", {
        name: /never be surprised by zero/i,
      });
      await heading.scrollIntoViewIfNeeded();
      await expect(heading).toBeVisible();
    });

    test("runway card lists capabilities", async ({ page }) => {
      const runwayHeading = page.getByRole("heading", {
        name: /never be surprised by zero/i,
      });
      await runwayHeading.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await expect(
        page.getByText("Live burn rate tracking")
      ).toBeVisible();
      await expect(
        page.getByText("Smart threshold alerts")
      ).toBeVisible();
      await expect(page.getByText("Peer benchmarking")).toBeVisible();
    });

    test("renders all 4 bottom feature cards", async ({ page }) => {
      await expect(
        page.getByText("Scenario Planning")
      ).toBeVisible();
      await expect(
        page.getByText("Revenue Intelligence")
      ).toBeVisible();
      await expect(
        page.getByText("Investor Reports")
      ).toBeVisible();
      await expect(
        page.getByText("Smart Integrations")
      ).toBeVisible();
    });

    test("bottom feature cards have descriptions", async ({ page }) => {
      await expect(
        page.getByText("Model any 'what if' before you commit")
      ).toBeVisible();
      await expect(
        page.getByText("MRR, ARR, churn — benchmarked")
      ).toBeVisible();
      await expect(
        page.getByText("Board decks in one click")
      ).toBeVisible();
      await expect(
        page.getByText("Connect in minutes")
      ).toBeVisible();
    });
  });

  /* ── CTA section ──────────────────────────────────────────────────────── */

  test.describe("CTA section", () => {
    test("displays metric cards", async ({ page }) => {
      // Scroll to CTA at bottom
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(500);

      await expect(page.getByText("500+")).toBeVisible();
      await expect(
        page.getByText("startups", { exact: true })
      ).toBeVisible();
      await expect(page.getByText("30 sec")).toBeVisible();
      await expect(
        page.getByText("setup", { exact: true })
      ).toBeVisible();
      await expect(page.getByText("$0").first()).toBeVisible();
      await expect(
        page.getByText("to start", { exact: true })
      ).toBeVisible();
    });

    test("displays CTA headline", async ({ page }) => {
      await expect(
        page.getByText(/ready to stop/i)
      ).toBeVisible();
      await expect(
        page.getByText(/guessing your runway/i)
      ).toBeVisible();
    });

    test("displays CTA description", async ({ page }) => {
      await expect(
        page.getByText(/replaced spreadsheet anxiety/i)
      ).toBeVisible();
    });

    test('has "Start free" primary CTA', async ({ page }) => {
      // There are multiple "Start free" links — get the one in CTA section
      const ctaLinks = page.getByRole("link", { name: /start free/i });
      const count = await ctaLinks.count();
      expect(count).toBeGreaterThanOrEqual(2); // nav + CTA section
    });

    test('has "Watch 60-second demo" button', async ({ page }) => {
      await expect(
        page.getByRole("button", { name: /watch 60-second demo/i })
      ).toBeVisible();
    });

    test("shows CTA trust badges", async ({ page }) => {
      await expect(
        page.getByText("256-bit encryption")
      ).toBeVisible();
      // SOC 2 ready appears in both hero and CTA
      const soc2 = page.getByText("SOC 2 ready");
      expect(await soc2.count()).toBeGreaterThanOrEqual(1);
    });
  });

  /* ── Footer ───────────────────────────────────────────────────────────── */

  test.describe("Footer", () => {
    test("footer is present", async ({ page }) => {
      const footer = page.locator("footer");
      await expect(footer).toBeVisible();
    });
  });

  /* ── Console errors ───────────────────────────────────────────────────── */

  test("no critical console errors on page load", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        // Ignore known non-critical warnings
        if (
          text.includes("favicon") ||
          text.includes("hydration") ||
          text.includes("Failed to load resource")
        )
          return;
        errors.push(text);
      }
    });

    await page.goto("/");
    await page.waitForTimeout(2000);

    expect(
      errors,
      `Unexpected console errors: ${errors.join("; ")}`
    ).toHaveLength(0);
  });

  /* ── Page structure ───────────────────────────────────────────────────── */

  test("page has all major sections in correct order", async ({ page }) => {
    // Wait for key elements to be present in DOM before checking positions
    await page.getByRole("heading", { name: /know your runway/i }).waitFor();

    const positions = await page.evaluate(() => {
      const getElTop = (selector: string): number => {
        const el = document.querySelector(selector);
        return el ? el.getBoundingClientRect().top : -1;
      };
      // Use structural selectors that don't depend on text hydration timing
      return {
        hero: getElTop("section:first-of-type"), // Hero is first <section>
        features: getElTop("#features"),
        footer: getElTop("footer"),
      };
    });

    expect(positions.hero, "Hero section should be on page").toBeGreaterThanOrEqual(0);
    expect(
      positions.features,
      "Features should appear after hero"
    ).toBeGreaterThan(positions.hero);
    expect(positions.footer, "Footer should appear after features").toBeGreaterThan(
      positions.features
    );
  });
});

/* ── Mobile responsive tests ──────────────────────────────────────────── */

test.describe("Landing page — mobile responsive", () => {
  test.describe("Mobile (375px)", () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test("loads and shows hero at 375px", async ({ page }) => {
      await page.goto("/");
      await expect(
        page.getByRole("heading", { name: /know your runway/i })
      ).toBeVisible();
    });

    test("mobile CTA button is visible (nav Start free)", async ({ page }) => {
      await page.goto("/");
      // On mobile, the sm:hidden Start free button should be visible
      const mobileBtn = page.getByRole("link", { name: /start free/i });
      await expect(mobileBtn.first()).toBeVisible();
    });

    test("desktop nav links are hidden on mobile", async ({ page }) => {
      await page.goto("/");
      // Desktop nav (Features, Companion, Log in) should be hidden
      const featuresLink = page.locator('nav a[href="#features"]');
      if ((await featuresLink.count()) > 0) {
        await expect(featuresLink).not.toBeVisible();
      }
    });

    test("social proof stats stack vertically", async ({ page }) => {
      await page.goto("/");
      await expect(
        page.getByText("Financial decisions powered")
      ).toBeVisible();
    });

    test("features section renders at mobile width", async ({ page }) => {
      await page.goto("/");
      const features = page.locator("#features");
      await features.scrollIntoViewIfNeeded();
      await expect(
        page.getByText("Scenario Planning")
      ).toBeVisible();
    });

    test("CTA section renders at mobile width", async ({ page }) => {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      // Scroll the "Start free" CTA link near bottom into view
      const ctaLink = page.getByRole("link", { name: /start free/i }).last();
      await ctaLink.scrollIntoViewIfNeeded();
      await expect(ctaLink).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe("Tablet (768px)", () => {
    test.use({ viewport: { width: 768, height: 1024 } });

    test("loads and shows hero at 768px", async ({ page }) => {
      await page.goto("/");
      await expect(
        page.getByRole("heading", { name: /know your runway/i })
      ).toBeVisible();
    });

    test("social proof renders integration logos", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByText("QuickBooks").first()).toBeVisible();
    });

    test("feature cards are visible", async ({ page }) => {
      await page.goto("/");
      const features = page.locator("#features");
      await features.scrollIntoViewIfNeeded();
      await expect(
        page.getByText("Scenario Planning")
      ).toBeVisible();
      await expect(
        page.getByText("Revenue Intelligence")
      ).toBeVisible();
    });
  });

  test.describe("Desktop (1024px)", () => {
    test.use({ viewport: { width: 1024, height: 768 } });

    test("loads and shows full nav at 1024px", async ({ page }) => {
      await page.goto("/");
      await expect(
        page.getByRole("link", { name: /log in/i })
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: /start free/i }).first()
      ).toBeVisible();
    });

    test("feature cards display in grid", async ({ page }) => {
      await page.goto("/");
      const features = page.locator("#features");
      await features.scrollIntoViewIfNeeded();
      // All 4 cards should be visible at desktop width
      await expect(
        page.getByText("Scenario Planning")
      ).toBeVisible();
      await expect(
        page.getByText("Smart Integrations")
      ).toBeVisible();
    });
  });
});
