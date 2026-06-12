/**
 * Tests for the actuals toolset (S3a Plan 3): list_accounts + record_transaction.
 *
 * HARNESS: real PGLite via @db-test (mirrors audit-attribution.test.ts) — the DB
 * is real; only framework seams that the import graph pulls are mocked.
 */
import { describe, it, expect, vi } from "vitest";
import { createUser, createCompany, createFinancialAccount } from "@db-test/factories";
import type { ToolContext } from "../types";

// Import-graph isolation: transactions.ts → data-mutation-tracker pulls
// next/cache; keep the DB real, mock the framework seams only.
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));

import { transactionHandlers } from "../transactions";

async function setup() {
  const user = await createUser();
  const company = await createCompany(user.id);
  const revenue = await createFinancialAccount(company.id, {
    name: "SaaS Revenue",
    type: "income",
    category: "revenue",
  });
  const expense = await createFinancialAccount(company.id, {
    name: "Cloud Infra",
    type: "expense",
    category: "operating_expense",
  });
  const ctx: ToolContext = { companyId: company.id, userId: user.id };
  return {
    ctx,
    companyId: company.id,
    revenueAccountId: revenue.id,
    expenseAccountId: expense.id,
  };
}

describe("list_accounts", () => {
  it("returns the company's accounts with id/name/type/category", async () => {
    const { ctx } = await setup();
    const out = JSON.parse(await transactionHandlers.list_accounts!({}, ctx));
    expect(Array.isArray(out.accounts)).toBe(true);
    const names = out.accounts.map((a: { name: string }) => a.name);
    expect(names).toContain("SaaS Revenue");
    const rev = out.accounts.find((a: { name: string }) => a.name === "SaaS Revenue");
    expect(rev).toMatchObject({ type: "income", category: "revenue" });
    expect(typeof rev.id).toBe("string");
  });
});

