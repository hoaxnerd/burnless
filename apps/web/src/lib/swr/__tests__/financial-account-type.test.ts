import { describe, it, expect } from "vitest";
import type { FinancialAccount } from "@/lib/swr";

describe("FinancialAccount type", () => {
  it("matches the real financial_accounts columns + transactionCount", () => {
    const account: FinancialAccount = {
      id: "acc-1",
      companyId: "company-1",
      name: "Revenue",
      type: "income",
      category: "revenue",
      parentId: null,
      isSystem: true,
      sortOrder: 0,
      coversHeadcount: false,
      transactionCount: 4,
      createdAt: "2026-06-25T00:00:00.000Z",
      updatedAt: "2026-06-25T00:00:00.000Z",
    };
    expect(account.category).toBe("revenue");
    expect(account.isSystem).toBe(true);
    expect(account.transactionCount).toBe(4);
    // @ts-expect-error — the stale `subtype` field must no longer exist on the type.
    expect(account.subtype).toBeUndefined();
  });
});
