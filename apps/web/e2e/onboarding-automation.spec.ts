import { test, expect } from "@playwright/test";
import path from "path";

test.describe("Onboarding automation test with public startup data", () => {
  test("signup with new email and check onboarding automation", async ({ page }) => {
    // Log console messages, errors, and request details
    page.on("console", msg => {
      console.log(`[BROWSER CONSOLE] [${msg.type()}] ${msg.text()}`);
    });
    page.on("pageerror", err => {
      console.log(`[BROWSER EXCEPTION] ${err.stack || err.message}`);
    });
    page.on("requestfailed", req => {
      console.log(`[BROWSER REQ FAIL] ${req.method()} ${req.url()} - ${req.failure()?.errorText || "unknown error"}`);
    });

    // Increase test timeout for this slow AI agent test
    test.setTimeout(180_000);

    // Generate a unique email using linear.app domain
    const email = `test+${Date.now()}@linear.app`;
    console.log(`[E2E] Registering user with email: ${email}`);

    const cookieButton = page.getByRole("button", { name: "Accept all" });
    const dismissCookies = async (stageName: string) => {
      try {
        // Wait briefly for banner to render
        await page.waitForTimeout(500);
        if (await cookieButton.isVisible()) {
          await cookieButton.click();
          console.log(`[E2E] Cookie banner dismissed at ${stageName}`);
          await page.waitForTimeout(500);
        }
      } catch (e) {
        console.log(`[E2E] Cookie banner not dismissed at ${stageName}:`, e);
      }
    };

    // Go to login page
    await page.goto("http://localhost:3000/login");
    await expect(page.getByText("Welcome to burnless")).toBeVisible({ timeout: 15_000 });
    await dismissCookies("login page");

    // Enter email and continue
    await page.getByPlaceholder("you@startup.com").fill(email);
    await page.getByRole("button", { name: "Continue" }).click();

    // Fill registration details
    await expect(
      page.getByRole("heading", { name: "Create your account" })
    ).toBeVisible({ timeout: 10_000 });
    await dismissCookies("register page");

    await page.getByPlaceholder("Jane Doe").fill("Linear E2E Tester");
    await page.getByPlaceholder("Min. 8 characters").fill("TestPassword123!");
    await page.getByRole("button", { name: "Create account" }).click({ force: true });

    // Verify redirect to onboarding
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 15_000 });
    console.log("[E2E] Redirected to onboarding page successfully");
    await dismissCookies("onboarding page");

    // Enter linear.app website URL
    const websiteInput = page.getByPlaceholder("yourcompany.com");
    await expect(websiteInput).toBeVisible({ timeout: 10_000 });
    await websiteInput.click();
    await websiteInput.fill("linear.app");
    await websiteInput.dispatchEvent("input");
    await websiteInput.dispatchEvent("change");
    await websiteInput.press("Tab");

    // Click Set Up My Company
    const setupButton = page.getByRole("button", { name: "Set Up My Company" });
    await expect(setupButton).toBeEnabled({ timeout: 5000 });
    await setupButton.click();

    console.log("[E2E] Triggered AI enrichment for linear.app");

    // Expect the enriching page state
    await expect(page.getByText(/analyzing|enriching/i).first()).toBeVisible({ timeout: 10_000 });

    // Wait for the agent to finish and transition to the Review step.
    // The agent might take up to 2-3 minutes to crawl, search, and parse details.
    // We give it a generous timeout of 180 seconds.
    const reviewHeading = page.getByRole("heading", { name: "Verify your details" });
    await expect(reviewHeading).toBeVisible({ timeout: 180_000 });
    console.log("[E2E] AI Onboarding finished successfully! Arrived at Review Step.");

    // Dismiss cookies on review step so they don't cover fields in the screenshot
    await dismissCookies("review page");

    // Take screenshot of the review step to visualize the enriched values
    const screenshotPath = path.resolve(__dirname, "../../e2e/test-results/linear-onboarding-review.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`[E2E] Screenshot saved to ${screenshotPath}`);

    // Wait a couple of seconds to make sure DOM has stabilized
    await page.waitForTimeout(2000);

    // Let's print out what elements/fields have values filled in!
    // We can evaluate inputs in the browser to log the suggested data
    const values = await page.evaluate(() => {
      const getValByLabel = (labelText: string) => {
        const label = Array.from(document.querySelectorAll("label")).find(
          el => el.textContent?.trim().toLowerCase().includes(labelText.toLowerCase())
        );
        if (!label) return null;
        const parent = label.closest("div")?.parentElement;
        if (!parent) return null;
        const input = parent.querySelector("input") as HTMLInputElement;
        return input ? input.value : null;
      };
      
      const getSelectedButton = (labelText: string) => {
        const label = Array.from(document.querySelectorAll("label")).find(
          el => el.textContent?.trim().toLowerCase().includes(labelText.toLowerCase())
        );
        if (!label) return null;
        const parent = label.closest("div")?.parentElement;
        if (!parent) return null;
        const buttons = Array.from(parent.querySelectorAll("button"));
        const active = buttons.find(b => b.className.includes("bg-brand-") || b.className.includes("text-white"));
        return active ? active.textContent?.trim() : null;
      };

      return {
        companyName: getValByLabel("Company Name"),
        stage: getSelectedButton("Stage"),
        businessModel: getSelectedButton("Business Model"),
        industry: getValByLabel("Industry"),
        founders: (() => {
          const foundersLabel = Array.from(document.querySelectorAll("span")).find(
            el => el.textContent?.trim().toLowerCase().includes("suggested founders")
          );
          if (foundersLabel) {
            const container = foundersLabel.nextElementSibling;
            if (container) {
              return Array.from(container.querySelectorAll("button")).map(b => b.textContent?.trim() || "");
            }
          }
          return [];
        })(),
        monthlyRevenue: getValByLabel("Monthly Revenue"),
      };
    });

    console.log("[E2E] Suggested Company Profile details found by AI:", JSON.stringify(values, null, 2));

    // Also look for lists of headcount, expenses, revenue streams suggested in review sections
    const listsText = await page.evaluate(() => {
      return {
        founders: document.body.innerHTML.includes("Founders") ? "Founders present" : "No Founders block",
        fundingRounds: document.body.innerHTML.includes("Funding rounds") || document.body.innerHTML.includes("Funding Round") ? "Funding rounds present" : "No Funding rounds block",
        expenses: document.body.innerHTML.includes("Operating Expenses") || document.body.innerHTML.includes("Expenses") ? "Expenses present" : "No Expenses block",
      };
    });
    console.log("[E2E] Review sections detection:", JSON.stringify(listsText, null, 2));
  });
});
