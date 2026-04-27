import { describe, it, expect, beforeEach } from "vitest";
import { vi } from "vitest";
import { getTestDb } from "../../__tests__/setup";

// Mock the db import used by query functions — point it at PGLite
vi.mock("../../index", () => ({
  get db() {
    return getTestDb();
  },
}));

import { hasFinancialData } from "../company-financial-data";
import {
  createUser,
  createCompany,
  createDepartment,
  createFinancialAccount,
  createRevenueStream,
  createHeadcountPlan,
  createFundingRound,
  createTransaction,
} from "../../__tests__/factories";

describe("hasFinancialData", () => {
  let companyId: string;

  beforeEach(async () => {
    const user = await createUser({ email: `hfd-${Date.now()}@test.burnless.app` });
    const company = await createCompany(user.id);
    companyId = company.id;
  });

  it("returns false for a company with no financial data", async () => {
    expect(await hasFinancialData(companyId)).toBe(false);
  });

  it("returns true when a revenue stream exists", async () => {
    await createRevenueStream(companyId);
    expect(await hasFinancialData(companyId)).toBe(true);
  });

  it("returns true when an expense (transaction) exists", async () => {
    const account = await createFinancialAccount(companyId);
    await createTransaction(companyId, account.id);
    expect(await hasFinancialData(companyId)).toBe(true);
  });

  it("returns true when a headcount plan exists", async () => {
    const dept = await createDepartment(companyId);
    await createHeadcountPlan(companyId, dept.id);
    expect(await hasFinancialData(companyId)).toBe(true);
  });

  it("returns true when a funding round exists", async () => {
    await createFundingRound(companyId);
    expect(await hasFinancialData(companyId)).toBe(true);
  });
});
