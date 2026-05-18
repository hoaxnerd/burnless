import { test, expect } from "@playwright/test";

test.describe("Funding Phase 2 flows", () => {
  test("create SAFE round with cap + discount", async ({ page }) => {
    await page.goto("/funding");
    await page.getByRole("button", { name: /add funding round/i }).click();
    await page.getByLabel("Round name").fill("YC SAFE");
    await page.getByLabel("Round type").selectOption("safe");
    await page.getByLabel("Total amount").fill("500000");
    await page.getByLabel("Valuation Cap").fill("10000000");
    await page.getByLabel("Discount Rate").fill("20");
    await page.getByRole("button", { name: /save/i }).click();
    await expect(page.getByText("YC SAFE")).toBeVisible();
  });

  test("edit round — roundType field is read-only", async ({ page }) => {
    await page.goto("/funding");
    await page.getByText("YC SAFE").click();
    await page.getByRole("button", { name: /edit/i }).click();
    await expect(page.getByText(/safe \(immutable/i)).toBeVisible();
    await expect(page.getByLabel("Round type")).toHaveCount(0);
  });

  test("debt round emits interest + principal in cash flow", async ({ page }) => {
    await page.goto("/funding");
    await page.getByRole("button", { name: /add funding round/i }).click();
    await page.getByLabel("Round name").fill("Bridge Loan");
    await page.getByLabel("Round type").selectOption("debt");
    await page.getByLabel("Total amount").fill("240000");
    await page.getByLabel("Interest Rate").fill("12");
    await page.getByLabel("Term Months").fill("12");
    await page.getByRole("button", { name: /save/i }).click();
    await page.goto("/reports/cf");
    await expect(page.getByText(/interest expense/i)).toBeVisible();
    await expect(page.getByText(/principal payments/i)).toBeVisible();
  });

  test("grant milestone hit triggers cash disbursement + warning chip when match unmet", async ({ page }) => {
    await page.goto("/funding");
    await page.getByRole("button", { name: /add funding round/i }).click();
    await page.getByLabel("Round name").fill("R&D Match Grant");
    await page.getByLabel("Round type").selectOption("grant");
    await page.getByLabel("Total amount").fill("100000");
    await page.getByRole("button", { name: /\+ add milestone/i }).click();
    await page.getByPlaceholder("Milestone label").fill("Q1 Progress");
    await page.locator('input[type="number"]').first().fill("50000");
    await page.getByLabel("Required Internal Spend").fill("200000");
    await page.getByLabel("Match As-Of Date").fill("2026-12-31");
    await page.getByRole("button", { name: /save/i }).click();
    await expect(page.getByText("R&D Match Grant")).toBeVisible();

    await page.getByText("R&D Match Grant").click();
    const milestoneRow = page.locator("li", { hasText: "Q1 Progress" });
    await milestoneRow.getByRole("textbox", { name: /mark.*hit on date/i })
      .fill(new Date().toISOString().slice(0, 10));

    await page.reload();
    await expect(page.getByText(/match shortfall/i)).toBeVisible();
  });

  test("cap-table page renders ownership composition", async ({ page }) => {
    await page.goto("/funding/cap-table");
    await expect(page.getByRole("heading", { name: /cap table/i })).toBeVisible();
    await expect(page.getByText(/common/i)).toBeVisible();
  });
});
