import { test, expect } from "@playwright/test";

/**
 * Data entry flow E2E tests — add expense, revenue, team member, funding round.
 * All require auth, gated behind DATABASE_URL.
 */

const dbAvailable = !!process.env.DATABASE_URL;

test.describe("Data entry smoke tests (no auth)", () => {
  const dataPages = [
    { path: "/expenses", name: "Expenses" },
    { path: "/revenue", name: "Revenue" },
    { path: "/team", name: "Team" },
    { path: "/funding", name: "Funding" },
  ];

  for (const dp of dataPages) {
    test(`${dp.name} page does not return 500`, async ({ page }) => {
      const response = await page.goto(dp.path, { waitUntil: "commit" });
      expect(response?.status()).toBeLessThan(500);
    });
  }

  for (const dp of dataPages) {
    test(`${dp.name} page redirects unauthenticated users`, async ({
      page,
    }) => {
      await page.goto(dp.path, { waitUntil: "networkidle" });
      await expect(page).toHaveURL(/\/login/);
    });
  }
});

test.describe("Expenses data entry (requires auth)", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL for authenticated tests");

  test("expenses page shows heading", async ({ page }) => {
    await page.goto("/expenses");
    await expect(
      page.getByRole("heading", { name: "Expenses" })
    ).toBeVisible();
  });

  test("Add Expense button is visible", async ({ page }) => {
    await page.goto("/expenses");
    await expect(
      page.getByRole("button", { name: "Add Expense" })
    ).toBeVisible();
  });

  test("Add Expense form opens with correct fields", async ({ page }) => {
    await page.goto("/expenses");
    await page.getByRole("button", { name: "Add Expense" }).click();

    await expect(page.getByText("Add Expense")).toBeVisible();
    await expect(
      page.getByPlaceholder("e.g. AWS Hosting, Office Rent")
    ).toBeVisible();
    await expect(page.getByPlaceholder("5000")).toBeVisible();
    await expect(page.getByText("Category")).toBeVisible();
    await expect(page.getByText("Monthly Amount")).toBeVisible();
  });

  test("Add Expense form Cancel button closes modal", async ({ page }) => {
    await page.goto("/expenses");
    await page.getByRole("button", { name: "Add Expense" }).click();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(
      page.getByPlaceholder("e.g. AWS Hosting, Office Rent")
    ).not.toBeVisible();
  });

  test("expenses subtitle describes the page", async ({ page }) => {
    await page.goto("/expenses");
    await expect(
      page.getByText(/intelligent spend management/i)
    ).toBeVisible();
  });
});

test.describe("Revenue data entry (requires auth)", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL for authenticated tests");

  test("revenue page shows heading", async ({ page }) => {
    await page.goto("/revenue");
    await expect(
      page.getByRole("heading", { name: "Revenue" })
    ).toBeVisible();
  });

  test("Add Revenue Stream button is visible", async ({ page }) => {
    await page.goto("/revenue");
    await expect(
      page.getByRole("button", { name: "Add Revenue Stream" })
    ).toBeVisible();
  });

  test("revenue subtitle describes the page", async ({ page }) => {
    await page.goto("/revenue");
    await expect(
      page.getByText(/your growth story/i)
    ).toBeVisible();
  });
});

test.describe("Team data entry (requires auth)", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL for authenticated tests");

  test("team page shows heading", async ({ page }) => {
    await page.goto("/team");
    await expect(
      page.getByRole("heading", { name: "Team" })
    ).toBeVisible();
  });

  test("team subtitle describes the page", async ({ page }) => {
    await page.goto("/team");
    await expect(
      page.getByText(/headcount planning/i)
    ).toBeVisible();
  });
});

test.describe("Funding data entry (requires auth)", () => {
  test.skip(!dbAvailable, "Requires DATABASE_URL for authenticated tests");

  test("funding page shows heading", async ({ page }) => {
    await page.goto("/funding");
    await expect(
      page.getByRole("heading", { name: "Funding" })
    ).toBeVisible();
  });

  test("Add Funding button is visible", async ({ page }) => {
    await page.goto("/funding");
    await expect(
      page.getByRole("button", { name: "Add Funding" })
    ).toBeVisible();
  });

  test("funding subtitle describes the page", async ({ page }) => {
    await page.goto("/funding");
    await expect(
      page.getByText(/capital sources/i)
    ).toBeVisible();
  });
});
