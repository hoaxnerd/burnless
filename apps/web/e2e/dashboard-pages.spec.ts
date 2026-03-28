import { test, expect } from "@playwright/test";

/**
 * Dashboard page smoke tests — verify all dashboard routes respond without 500.
 * Unauthenticated users are redirected to /login; we verify the redirect works.
 */

const dashboardRoutes = [
  { path: "/dashboard", name: "Dashboard" },
  { path: "/expenses", name: "Expenses" },
  { path: "/revenue", name: "Revenue" },
  { path: "/funding", name: "Funding" },
  { path: "/team", name: "Team" },
  { path: "/scenarios", name: "Scenarios" },
  { path: "/reports", name: "Reports" },
  { path: "/import", name: "Import" },
  { path: "/data-room", name: "Data Room" },
  { path: "/ai", name: "Companion" },
  { path: "/settings", name: "Settings" },
];

test.describe("Dashboard page smoke tests", () => {
  for (const route of dashboardRoutes) {
    test(`${route.name} page (${route.path}) does not return 500`, async ({
      page,
    }) => {
      const response = await page.goto(route.path, { waitUntil: "commit" });
      expect(response?.status()).toBeLessThan(500);
    });
  }
});

test.describe("Protected route redirects", () => {
  for (const route of dashboardRoutes) {
    test(`${route.name} page redirects unauthenticated users to /login`, async ({
      page,
    }) => {
      await page.goto(route.path, { waitUntil: "networkidle" });
      // Should end up at /login after redirect
      await expect(page).toHaveURL(/\/login/);
    });
  }
});
