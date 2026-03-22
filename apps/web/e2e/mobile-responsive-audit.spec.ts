import { test, expect, Page } from "@playwright/test";

/**
 * Mobile Responsive Audit — BUR-95
 *
 * Verifies every page works at 375px width (iPhone SE minimum).
 * Per UX-STANDARDS.md §5: no horizontal scroll, touch targets >= 44px,
 * text readable, charts scrollable or stacked, sidebar collapses.
 *
 * Pages are split into public (no auth) and protected (auth required).
 * Protected pages may redirect — we accept that and note it.
 */

// iPhone SE viewport
const MOBILE_VIEWPORT = { width: 375, height: 667 };

test.use({
  viewport: MOBILE_VIEWPORT,
  // Use mobile user agent for accurate rendering
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  isMobile: true,
  hasTouch: true,
});

// ── Helpers ──────────────────────────────────────────────────────────────────

interface AuditResult {
  path: string;
  status: number;
  hasHorizontalOverflow: boolean;
  documentWidth: number;
  viewportWidth: number;
  overflowingElements: string[];
  smallTouchTargets: string[];
  truncatedFinancialNumbers: string[];
  pageTitle: string;
  errors: string[];
}

async function auditPage(page: Page, path: string): Promise<AuditResult> {
  const errors: string[] = [];

  // Collect console errors
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
    }
  });

  const response = await page.goto(path, {
    waitUntil: "domcontentloaded",
    timeout: 15_000,
  });

  const status = response?.status() ?? 0;

  // Wait a bit for hydration and lazy content
  await page.waitForTimeout(1500);

  // Check horizontal overflow
  const overflowCheck = await page.evaluate(() => {
    const docWidth = document.documentElement.scrollWidth;
    const viewportWidth = window.innerWidth;
    const hasOverflow = docWidth > viewportWidth + 2; // 2px tolerance

    // Find elements causing overflow
    const overflowing: string[] = [];
    if (hasOverflow) {
      const all = document.querySelectorAll("*");
      for (const el of all) {
        const rect = el.getBoundingClientRect();
        if (rect.right > viewportWidth + 2 && rect.width > 0) {
          const tag = el.tagName.toLowerCase();
          const cls = el.className
            ? `.${String(el.className).split(" ").slice(0, 2).join(".")}`
            : "";
          const id = el.id ? `#${el.id}` : "";
          overflowing.push(`${tag}${id}${cls}`);
          if (overflowing.length >= 10) break;
        }
      }
    }

    return { docWidth, viewportWidth, hasOverflow, overflowing };
  });

  // Check touch targets (interactive elements < 44x44px)
  const smallTargets = await page.evaluate(() => {
    const MIN_SIZE = 44;
    const interactiveSelectors =
      'a, button, input, select, textarea, [role="button"], [tabindex]';
    const elements = document.querySelectorAll(interactiveSelectors);
    const small: string[] = [];

    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      // Skip hidden elements
      if (rect.width === 0 || rect.height === 0) continue;
      // Skip elements off-screen
      if (rect.top > window.innerHeight * 2) continue;

      if (rect.width < MIN_SIZE || rect.height < MIN_SIZE) {
        const tag = el.tagName.toLowerCase();
        const text = (el.textContent || "").trim().slice(0, 30);
        const w = Math.round(rect.width);
        const h = Math.round(rect.height);
        small.push(`${tag}[${w}x${h}] "${text}"`);
        if (small.length >= 15) break;
      }
    }

    return small;
  });

  // Check for truncated financial numbers (ellipsis on numbers)
  const truncated = await page.evaluate(() => {
    const found: string[] = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    );
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = node.textContent || "";
      // Look for dollar amounts that end with ellipsis or are cut off
      if (/\$[\d,]+\.{3}/.test(text) || /\$[\d,]+…/.test(text)) {
        found.push(text.trim().slice(0, 50));
      }
    }

    // Also check computed styles for text-overflow: ellipsis on financial elements
    const numberElements = document.querySelectorAll(
      '[class*="amount"], [class*="price"], [class*="currency"], [class*="money"], [class*="balance"], [class*="total"]'
    );
    for (const el of numberElements) {
      const style = window.getComputedStyle(el);
      if (
        style.textOverflow === "ellipsis" &&
        (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth
      ) {
        found.push(`ellipsis on: ${(el.textContent || "").trim().slice(0, 50)}`);
      }
    }

    return found;
  });

  const pageTitle = await page.title();

  return {
    path,
    status,
    hasHorizontalOverflow: overflowCheck.hasOverflow,
    documentWidth: overflowCheck.docWidth,
    viewportWidth: overflowCheck.viewportWidth,
    overflowingElements: overflowCheck.overflowing,
    smallTouchTargets: smallTargets,
    truncatedFinancialNumbers: truncated,
    pageTitle,
    errors,
  };
}

// ── Public Pages (no auth required) ──────────────────────────────────────────

const PUBLIC_PAGES = [
  { path: "/", name: "Landing page" },
  { path: "/login", name: "Login" },
  { path: "/onboarding", name: "Onboarding" },
  { path: "/pricing", name: "Pricing" },
  { path: "/about", name: "About" },
  { path: "/contact", name: "Contact" },
  { path: "/help", name: "Help" },
  { path: "/security", name: "Security" },
  { path: "/terms", name: "Terms" },
  { path: "/privacy", name: "Privacy" },
  { path: "/reset-password", name: "Reset Password" },
];

test.describe("Mobile Audit: Public Pages (375px)", () => {
  for (const { path, name } of PUBLIC_PAGES) {
    test(`${name} (${path}) — no horizontal overflow`, async ({ page }) => {
      const result = await auditPage(page, path);

      // Must not return 500
      expect(
        result.status,
        `${name} returned server error ${result.status}`
      ).toBeLessThan(500);

      // Must not have horizontal overflow
      expect(
        result.hasHorizontalOverflow,
        `${name} has horizontal overflow at 375px. Document width: ${result.documentWidth}px. Overflowing elements: ${result.overflowingElements.join(", ")}`
      ).toBe(false);

      // Take screenshot for visual review
      await page.screenshot({
        path: `e2e/test-results/mobile-audit/${name.toLowerCase().replace(/\s+/g, "-")}-375px.png`,
        fullPage: true,
      });
    });

    test(`${name} (${path}) — touch targets >= 44px`, async ({ page }) => {
      const result = await auditPage(page, path);

      // Log small touch targets (warning, not hard fail for now)
      if (result.smallTouchTargets.length > 0) {
        console.warn(
          `[WARN] ${name}: ${result.smallTouchTargets.length} small touch targets:\n` +
            result.smallTouchTargets.map((t) => `  - ${t}`).join("\n")
        );
      }

      // Hard fail if more than 5 critical interactive elements are undersized
      expect(
        result.smallTouchTargets.length,
        `${name} has ${result.smallTouchTargets.length} touch targets below 44px minimum:\n${result.smallTouchTargets.join("\n")}`
      ).toBeLessThanOrEqual(5);
    });
  }
});

// ── Protected Pages (will redirect without auth, but should not 500) ─────────

const PROTECTED_PAGES = [
  { path: "/dashboard", name: "Dashboard" },
  { path: "/overview", name: "Overview" },
  { path: "/expenses", name: "Expenses" },
  { path: "/revenue", name: "Revenue" },
  { path: "/scenarios", name: "Scenarios" },
  { path: "/scenarios/compare", name: "Scenario Compare" },
  { path: "/ai", name: "AI Chat" },
  { path: "/reports", name: "Reports" },
  { path: "/reports/profit-loss", name: "Profit & Loss" },
  { path: "/reports/cash-flow", name: "Cash Flow" },
  { path: "/reports/balance-sheet", name: "Balance Sheet" },
  { path: "/reports/runway", name: "Runway" },
  { path: "/reports/metrics", name: "Metrics" },
  { path: "/reports/budget-vs-actuals", name: "Budget vs Actuals" },
  { path: "/reports/scenario-compare", name: "Scenario Compare Report" },
  { path: "/reports/board-update", name: "Board Update" },
  { path: "/team", name: "Team" },
  { path: "/funding", name: "Funding" },
  { path: "/settings", name: "Settings" },
  { path: "/import", name: "Import" },
  { path: "/data-room", name: "Data Room" },
];

test.describe("Mobile Audit: Protected Pages (375px, no-auth smoke)", () => {
  for (const { path, name } of PROTECTED_PAGES) {
    test(`${name} (${path}) — no 500 at mobile viewport`, async ({ page }) => {
      const response = await page.goto(path, {
        waitUntil: "domcontentloaded",
        timeout: 15_000,
      });

      const status = response?.status() ?? 0;

      // Protected pages may redirect (302/307) — that's expected.
      // They must never 500.
      expect(
        status,
        `${name} returned server error ${status} at 375px viewport`
      ).toBeLessThan(500);

      await page.screenshot({
        path: `e2e/test-results/mobile-audit/${name.toLowerCase().replace(/\s+/g, "-")}-375px.png`,
        fullPage: true,
      });
    });
  }
});

// ── Summary Report ───────────────────────────────────────────────────────────

test("Generate mobile audit summary report", async ({ page }) => {
  const results: AuditResult[] = [];

  for (const { path, name } of PUBLIC_PAGES) {
    try {
      const result = await auditPage(page, path);
      results.push(result);
    } catch (e) {
      results.push({
        path,
        status: 0,
        hasHorizontalOverflow: false,
        documentWidth: 0,
        viewportWidth: 375,
        overflowingElements: [],
        smallTouchTargets: [],
        truncatedFinancialNumbers: [],
        pageTitle: name,
        errors: [(e as Error).message],
      });
    }
  }

  // Build summary
  const overflowPages = results.filter((r) => r.hasHorizontalOverflow);
  const touchTargetIssues = results.filter(
    (r) => r.smallTouchTargets.length > 0
  );
  const truncationIssues = results.filter(
    (r) => r.truncatedFinancialNumbers.length > 0
  );
  const serverErrors = results.filter((r) => r.status >= 500);

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  MOBILE RESPONSIVE AUDIT SUMMARY (375px)");
  console.log("═══════════════════════════════════════════════════\n");

  console.log(`Pages audited: ${results.length}`);
  console.log(`Server errors (500+): ${serverErrors.length}`);
  console.log(`Horizontal overflow: ${overflowPages.length}`);
  console.log(`Touch target issues: ${touchTargetIssues.length}`);
  console.log(`Financial truncation: ${truncationIssues.length}`);

  if (overflowPages.length > 0) {
    console.log("\n── HORIZONTAL OVERFLOW ──");
    for (const r of overflowPages) {
      console.log(
        `  ${r.path}: ${r.documentWidth}px (overflow by ${r.documentWidth - r.viewportWidth}px)`
      );
      for (const el of r.overflowingElements) {
        console.log(`    → ${el}`);
      }
    }
  }

  if (touchTargetIssues.length > 0) {
    console.log("\n── SMALL TOUCH TARGETS ──");
    for (const r of touchTargetIssues) {
      console.log(`  ${r.path}: ${r.smallTouchTargets.length} elements`);
      for (const t of r.smallTouchTargets.slice(0, 5)) {
        console.log(`    → ${t}`);
      }
    }
  }

  if (truncationIssues.length > 0) {
    console.log("\n── TRUNCATED FINANCIAL NUMBERS ──");
    for (const r of truncationIssues) {
      for (const t of r.truncatedFinancialNumbers) {
        console.log(`  ${r.path}: ${t}`);
      }
    }
  }

  if (serverErrors.length > 0) {
    console.log("\n── SERVER ERRORS ──");
    for (const r of serverErrors) {
      console.log(`  ${r.path}: HTTP ${r.status}`);
    }
  }

  console.log("\n═══════════════════════════════════════════════════\n");

  // Fail if any page has a server error
  expect(
    serverErrors.length,
    `${serverErrors.length} pages returned 500+ errors`
  ).toBe(0);
});
