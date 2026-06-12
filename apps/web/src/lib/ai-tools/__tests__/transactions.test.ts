/**
 * Tests for the actuals toolset (S3a Plan 3): list_accounts + record_transaction.
 *
 * HARNESS: real PGLite via @db-test (mirrors audit-attribution.test.ts) — the DB
 * is real; only framework seams that the import graph pulls are mocked.
 */
import { describe, it, expect, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createUser, createCompany, createFinancialAccount } from "@db-test/factories";
import { getTestDb } from "@db-test/setup";
import { transactions } from "@burnless/db";
import type { ToolContext } from "../types";

// Import-graph isolation (same idiom as audit-attribution.test.ts): the
// classification test imports ../index, whose static graph pulls data.ts →
// @/lib/auth → next-auth, which cannot resolve in vitest. Mock the framework
// seams only — the DB stays real PGLite.
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: (fn: unknown) => fn };
});
vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue(null),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => undefined }),
}));
// The handler's trackDataMutation fires invalidateInsights fire-and-forget (correct
// production behavior — matches the api/transactions route). Under PGLite (single
// connection, no pool) that in-flight INSERT...ON CONFLICT overlaps the next
// record_transaction call's own upsert and deadlocks. Stub the tracker so the test
// exercises only the transaction write path (the assertions don't cover insight
// restaling). Real postgres-js pools have no such overlap.
vi.mock("@/lib/data-mutation-tracker", () => ({
  trackDataMutation: vi.fn().mockResolvedValue(undefined),
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

describe("record_transaction (insert)", () => {
  it("records an actual on a company account and returns it", async () => {
    const { ctx, revenueAccountId } = await setup();
    const out = JSON.parse(await transactionHandlers.record_transaction!(
      { accountId: revenueAccountId, date: "2026-06-08", amount: 12480, description: "Stripe week", externalId: "ch_1" },
      ctx
    ));
    expect(out.error).toBeUndefined();
    expect(out.id).toBeTruthy();
    expect(out.action).toBe("created");
    expect(Number(out.amount)).toBe(12480);
  });

  it("rejects an accountId that does not belong to the company", async () => {
    const { ctx } = await setup();
    const out = JSON.parse(await transactionHandlers.record_transaction!(
      { accountId: "acc-from-another-company", date: "2026-06-08", amount: 1 },
      ctx
    ));
    expect(out.error).toMatch(/account/i);
  });
});

describe("record_transaction classification", () => {
  it("is a mutation/write tool (raises confirm in chat) and is non-facade (base-table writer)", async () => {
    const { MUTATION_TOOL_NAMES } = await import("@burnless/ai");
    expect(MUTATION_TOOL_NAMES.has("record_transaction")).toBe(true);
    const { __testables } = await import("../index");
    expect(__testables.NON_FACADE_MUTATION_TOOLS.has("record_transaction")).toBe(true);
  });
});

describe("record_transaction (idempotent upsert)", () => {
  it("re-running with the same externalId updates the existing row, not a duplicate", async () => {
    const { ctx, revenueAccountId, companyId } = await setup();
    const first = JSON.parse(await transactionHandlers.record_transaction!(
      { accountId: revenueAccountId, date: "2026-06-08", amount: 100, externalId: "ch_dup" }, ctx
    ));
    expect(first.action).toBe("created");
    const second = JSON.parse(await transactionHandlers.record_transaction!(
      { accountId: revenueAccountId, date: "2026-06-08", amount: 250, externalId: "ch_dup" }, ctx
    ));
    expect(second.action).toBe("updated");

    // exactly one row for that externalId, amount reflects the update
    const rows = await getTestDb()
      .select()
      .from(transactions)
      .where(and(eq(transactions.companyId, companyId), eq(transactions.externalId, "ch_dup")));
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.amount)).toBe(250);
  });

  it("two transactions with NO externalId both insert (nulls are not deduped)", async () => {
    const { ctx, revenueAccountId } = await setup();
    const a = JSON.parse(await transactionHandlers.record_transaction!({ accountId: revenueAccountId, date: "2026-06-08", amount: 1 }, ctx));
    const b = JSON.parse(await transactionHandlers.record_transaction!({ accountId: revenueAccountId, date: "2026-06-08", amount: 2 }, ctx));
    expect(a.id).not.toBe(b.id);
  });
});

