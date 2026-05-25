/**
 * Unit tests for POST /api/onboarding
 *
 * Tests auth, validation, idempotency, company creation, and financial setup.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

/* ── Hoisted mocks ─────────────────────────────────────────────────── */

const { mockGetAuthUser, mockGetUserCompany } = vi.hoisted(() => ({
  mockGetAuthUser: vi.fn(),
  mockGetUserCompany: vi.fn(),
}));

const {
  mockInsert,
  mockValues,
  mockReturning,
  mockSelect,
  mockFrom,
  mockWhere,
  mockLimit,
  mockTransaction,
} = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  mockValues: vi.fn(),
  mockReturning: vi.fn(),
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockLimit: vi.fn(),
  mockTransaction: vi.fn(),
}));

/* ── Module mocks ──────────────────────────────────────────────────── */

vi.mock("@/lib/api-helpers", () => ({
  getAuthUser: mockGetAuthUser,
  getUserCompany: mockGetUserCompany,
  errorResponse: (msg: string, status: number) =>
    NextResponse.json({ error: msg }, { status }),
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock("@burnless/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    transaction: mockTransaction,
  },
  companies: { id: "id", name: "name" },
  companyMembers: {},
  scenarios: { id: "id", companyId: "companyId", deletedAt: "deletedAt" },
  financialAccounts: {},
  departments: {},
  forecastLines: {},
  revenueStreams: {},
  aiFeatureFlags: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  isNull: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

import { POST } from "../route";

/* ── Helpers ────────────────────────────────────────────────────────── */

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/onboarding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  company_name: "Acme Corp",
  stage: "Seed",
  business_model: "SaaS",
  monthly_revenue: "$10k",
  team_size: "5",
  funding: "500000",
  main_expenses: "Engineering salaries",
};

/* ── Tests ──────────────────────────────────────────────────────────── */

describe("POST /api/onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: DB chain setup
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({ returning: mockReturning });
  });

  /* ── Auth checks ──────────────────────────────────────────────── */

  it("returns 401 when not authenticated", async () => {
    mockGetAuthUser.mockResolvedValue(null);

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toContain("sign in");
  });

  it("returns 401 when user has no id", async () => {
    mockGetAuthUser.mockResolvedValue({});

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(401);
  });

  /* ── Validation ───────────────────────────────────────────────── */

  it("returns 400 when company_name is missing", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1" });
    mockGetUserCompany.mockResolvedValue(null);

    const req = makeRequest({ stage: "Seed" });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeTruthy();
  });

  it("returns 400 when company_name is empty string", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1" });
    mockGetUserCompany.mockResolvedValue(null);

    const req = makeRequest({ company_name: "" });
    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON body", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1" });
    mockGetUserCompany.mockResolvedValue(null);

    const req = new Request("http://localhost/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  /* ── Idempotency ──────────────────────────────────────────────── */

  it("returns 409 ONBOARDING_ALREADY_COMPLETE when user already has a company", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1" });
    mockGetUserCompany.mockResolvedValue({ companyId: "existing-co" });

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe("ONBOARDING_ALREADY_COMPLETE");
    expect(body.companyId).toBe("existing-co");
    expect(body.redirectTo).toBe("/dashboard");
    expect(body.error).toBeTruthy();
    // Should NOT have called transaction for creation
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  /* ── Successful creation ──────────────────────────────────────── */

  it("creates company with 201 on valid input", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1" });
    mockGetUserCompany.mockResolvedValue(null);

    const txResult = { companyId: "new-co", scenarioId: "new-scenario" };
    mockTransaction.mockImplementation(async (_fn: (...args: unknown[]) => unknown) => txResult);

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.companyId).toBe("new-co");
    expect(body.scenarioId).toBe("new-scenario");
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it("uses default values when optional fields omitted", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1" });
    mockGetUserCompany.mockResolvedValue(null);

    const txResult = { companyId: "new-co", scenarioId: "new-scenario" };
    mockTransaction.mockImplementation(async () => txResult);

    const req = makeRequest({ company_name: "Minimal Corp" });
    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(mockTransaction).toHaveBeenCalled();
  });

  /* ── Regression: no silent revenue stream auto-create ─────────── */

  // Onboarding used to insert a subscription revenueStream with
  // startingCustomers=1, +5 new/month, 5% churn — so a "Monthly Revenue $15k"
  // answer ballooned to ~$351k MRR by month 6 on a brand-new dashboard.
  // Now: monthly_revenue is captured but no data row is created on the user's
  // behalf — they add a real stream via /revenue.
  it("does not insert into revenueStreams even when monthly_revenue is set", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1" });
    mockGetUserCompany.mockResolvedValue(null);

    const dbMod = await import("@burnless/db");
    const tablesInserted: unknown[] = [];
    const txInsert = vi.fn().mockImplementation((table: unknown) => {
      tablesInserted.push(table);
      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "new-id" }]),
        }),
      };
    });
    mockTransaction.mockImplementation(
      async (fn: (tx: { insert: typeof txInsert }) => Promise<unknown>) =>
        fn({ insert: txInsert })
    );

    const res = await POST(
      makeRequest({ ...validBody, monthly_revenue: "$50k" })
    );

    expect(res.status).toBe(201);
    expect(tablesInserted).not.toContain(dbMod.revenueStreams);
  });

  /* ── Error handling ───────────────────────────────────────────── */

  it("returns 500 when transaction fails", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1" });
    mockGetUserCompany.mockResolvedValue(null);

    mockTransaction.mockRejectedValue(
      new Error("Could not create your company — please try again")
    );

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toContain("company");
  });

  it("returns 500 with generic message for non-Error exceptions", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1" });
    mockGetUserCompany.mockResolvedValue(null);

    mockTransaction.mockRejectedValue("string error");

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBeTruthy();
  });
});
