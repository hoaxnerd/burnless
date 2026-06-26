/**
 * resolveAccountId() — C2.4 account resolution.
 *
 * Web vitest mocks the DB (happy-dom, no PGlite). We mock `getAccounts` to
 * supply the company's account list and a minimal Drizzle insert chain to
 * capture the "Payment processing fees" create-if-absent path.
 *
 * Behaviour under test:
 *  - "revenue"/"refund"/"dispute" → the first income/revenue account
 *  - "payment_processing_fees" → an existing case-insensitive "Payment
 *    processing fees" expense account when present
 *  - "payment_processing_fees" → CREATE the fees account once when absent
 *    (find-before-create idempotent)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { getAccounts, mockInsert, mockValues, mockReturning } = vi.hoisted(() => ({
  getAccounts: vi.fn(),
  mockInsert: vi.fn(),
  mockValues: vi.fn(),
  mockReturning: vi.fn(),
}));

vi.mock("@/lib/data", () => ({ getAccounts }));

vi.mock("@burnless/db", () => ({
  db: { insert: mockInsert },
  financialAccounts: { companyId: "companyId", name: "name" },
}));

import { resolveAccountId } from "../accounts";

interface Acct {
  id: string;
  name: string;
  type: string;
  category: string;
}

const REVENUE: Acct = { id: "rev-1", name: "Revenue", type: "income", category: "revenue" };
const OTHER_INCOME: Acct = { id: "oi-1", name: "Interest", type: "income", category: "other_income" };
const FEES: Acct = {
  id: "fee-1",
  name: "Payment processing fees",
  type: "expense",
  category: "operating_expense",
};

let created: Array<Record<string, unknown>>;

beforeEach(() => {
  vi.clearAllMocks();
  created = [];
  mockInsert.mockReturnValue({ values: mockValues });
  mockValues.mockImplementation((vals: Record<string, unknown>) => {
    created.push(vals);
    return { returning: mockReturning };
  });
  mockReturning.mockImplementation(async () => [{ id: "fee-new", ...created[created.length - 1] }]);
});

describe("resolveAccountId", () => {
  it("resolves revenue/refund/dispute to the first income/revenue account", async () => {
    getAccounts.mockResolvedValue([OTHER_INCOME, REVENUE]);

    expect(await resolveAccountId("c1", "revenue")).toBe("rev-1");
    expect(await resolveAccountId("c1", "refund")).toBe("rev-1");
    expect(await resolveAccountId("c1", "dispute")).toBe("rev-1");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("resolves payment_processing_fees to an existing fees account (case-insensitive)", async () => {
    getAccounts.mockResolvedValue([REVENUE, { ...FEES, name: "PAYMENT PROCESSING FEES" }]);

    expect(await resolveAccountId("c1", "payment_processing_fees")).toBe("fee-1");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("creates the fees account once when absent (find-before-create)", async () => {
    getAccounts.mockResolvedValue([REVENUE]);

    const id = await resolveAccountId("c1", "payment_processing_fees");

    expect(id).toBe("fee-new");
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(created[0]).toMatchObject({
      companyId: "c1",
      name: "Payment processing fees",
      type: "expense",
      category: "operating_expense",
      isSystem: false,
    });
  });
});
