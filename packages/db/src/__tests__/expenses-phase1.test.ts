import { describe, expect, it, vi } from "vitest";
import { getTestDb } from "./setup";

vi.mock("../index", () => ({
  get db() {
    return getTestDb();
  },
}));

import { forecastLines, transactions } from "../schema";
import { createCompanyContext, createFinancialAccount } from "./factories";

describe("forecastLines Phase 1 schema", () => {
  it("persists notes/vendor/department/frequency/isOneTime/isRecurring", async () => {
    const db = getTestDb();
    const ctx = await createCompanyContext({
      user: { email: "expenses-phase1-a@test.burnless.app" },
      company: { name: "Expenses Phase1 A" },
    });

    const acct = await createFinancialAccount(ctx.company.id, {
      name: "Slack",
      type: "expense",
      category: "operating_expense",
    });

    const [inserted] = await db
      .insert(forecastLines)
      .values({
        companyId: ctx.company.id,
        accountId: acct.id,
        method: "fixed",
        parameters: { amount: 100 },
        startDate: new Date("2026-01-01"),
        endDate: null,
        notes: "Team chat",
        vendor: "Slack Technologies",
        frequency: "annual",
        isOneTime: false,
        isRecurring: true,
      })
      .returning();

    expect(inserted!.notes).toBe("Team chat");
    expect(inserted!.vendor).toBe("Slack Technologies");
    expect(inserted!.frequency).toBe("annual");
    expect(inserted!.isOneTime).toBe(false);
    expect(inserted!.isRecurring).toBe(true);
  });

  it("isRecurring is nullable (default NULL)", async () => {
    const db = getTestDb();
    const ctx = await createCompanyContext({
      user: { email: "expenses-phase1-b@test.burnless.app" },
      company: { name: "Expenses Phase1 B" },
    });
    const acct = await createFinancialAccount(ctx.company.id, {
      name: "Misc",
      type: "expense",
      category: "operating_expense",
    });

    const [inserted] = await db
      .insert(forecastLines)
      .values({
        companyId: ctx.company.id,
        accountId: acct.id,
        method: "fixed",
        parameters: {},
        startDate: new Date("2026-01-01"),
      })
      .returning();

    expect(inserted!.isRecurring).toBeNull();
    // Defaults still apply.
    expect(inserted!.frequency).toBe("monthly");
    expect(inserted!.isOneTime).toBe(false);
  });
});

describe("transactions Phase 1 schema", () => {
  it("persists vendor + notes columns", async () => {
    const db = getTestDb();
    const ctx = await createCompanyContext({
      user: { email: "expenses-phase1-c@test.burnless.app" },
      company: { name: "Expenses Phase1 C" },
    });
    const acct = await createFinancialAccount(ctx.company.id, {
      name: "Bank",
      type: "asset",
      category: "asset",
    });

    const [inserted] = await db
      .insert(transactions)
      .values({
        companyId: ctx.company.id,
        accountId: acct.id,
        date: new Date("2026-04-15"),
        amount: "100.00",
        description: "Coffee",
        vendor: "Blue Bottle",
        notes: "Client meeting",
      })
      .returning();

    expect(inserted!.vendor).toBe("Blue Bottle");
    expect(inserted!.notes).toBe("Client meeting");
    expect(inserted!.description).toBe("Coffee");
  });
});
