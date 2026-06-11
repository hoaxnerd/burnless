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
  companies: { __table: "companies", id: "id", name: "name" },
  companyMembers: { __table: "companyMembers" },
  scenarios: { __table: "scenarios", id: "id", companyId: "companyId", deletedAt: "deletedAt" },
  financialAccounts: { __table: "financialAccounts" },
  departments: { __table: "departments" },
  forecastLines: { __table: "forecastLines" },
  revenueStreams: { __table: "revenueStreams" },
  fundingRounds: { __table: "fundingRounds" },
  headcountPlans: { __table: "headcountPlans" },
  aiFeatureFlags: { __table: "aiFeatureFlags" },
  users: { __table: "users", id: "id" },
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
  user_name: "Jane Founder",
};

/**
 * Drive the REAL transaction callback against a recording fake `tx`, capturing
 * the rows inserted per table. Lets us assert what the slim route actually
 * persists (company, scenario, default accounts/departments) and what it
 * IGNORES (detailed arrays — revenue streams, funding, headcount, expenses).
 */
function recordTransactionInserts() {
  const inserts: { table: string; rows: unknown[] }[] = [];
  const txInsert = vi.fn().mockImplementation((table: { __table?: string }) => ({
    values: vi.fn().mockImplementation((rows: unknown) => {
      const arr = Array.isArray(rows) ? rows : [rows];
      inserts.push({ table: table?.__table ?? "unknown", rows: arr });
      return {
        returning: vi
          .fn()
          .mockResolvedValue(arr.map((_, i) => ({ id: `${table?.__table}-${i}`, name: (arr[i] as { name?: string })?.name }))),
      };
    }),
  }));
  const txUpdate = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
  });
  mockTransaction.mockImplementation(
    async (fn: (tx: { insert: typeof txInsert; update: typeof txUpdate }) => Promise<unknown>) =>
      fn({ insert: txInsert, update: txUpdate }),
  );
  const rowsFor = (table: string) =>
    inserts.filter((i) => i.table === table).flatMap((i) => i.rows);
  return { inserts, rowsFor };
}

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

  /* ── Slim route: company + scaffolding only ───────────────────── */

  // The wizard (S4b) creates the company first, then drives the REAL
  // per-domain endpoints for detailed entities. So /api/onboarding now
  // creates ONLY the company + scaffolding (company, member, base scenario,
  // default accounts, default departments, aiFeatureFlags) — never the
  // detailed arrays.
  it("creates company + base scenario + ≥6 expense/cogs accounts + 5 departments", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1" });
    mockGetUserCompany.mockResolvedValue(null);

    const { rowsFor } = recordTransactionInserts();

    const res = await POST(
      makeRequest({
        company_name: "Acme Corp",
        stage: "Seed",
        business_model: "SaaS",
        user_name: "Jane Founder",
      }),
    );

    expect(res.status).toBe(201);

    // A company row
    const companyRows = rowsFor("companies") as { name: string }[];
    expect(companyRows).toHaveLength(1);
    expect(companyRows[0]?.name).toBe("Acme Corp");

    // A base scenario
    const scenarioRows = rowsFor("scenarios") as { name: string }[];
    expect(scenarioRows).toHaveLength(1);

    // ≥6 expense/cogs accounts
    const accountRows = rowsFor("financialAccounts") as {
      category: string;
      type: string;
    }[];
    const expenseLike = accountRows.filter(
      (a) => a.category === "cogs" || a.type === "expense",
    );
    expect(expenseLike.length).toBeGreaterThanOrEqual(6);

    // 5 default departments
    const deptRows = rowsFor("departments");
    expect(deptRows).toHaveLength(5);
  });

  // Onboarding used to bulk-insert detailed arrays the user reviewed. The
  // wizard now persists those via the real endpoints, so the slim route
  // IGNORES any detailed arrays in the body — zero rows inserted.
  it("inserts ZERO revenue_streams even when revenue_streams is in the body", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1" });
    mockGetUserCompany.mockResolvedValue(null);

    const { rowsFor } = recordTransactionInserts();

    const res = await POST(
      makeRequest({
        ...validBody,
        revenue_streams: [
          {
            name: "Pro Plan",
            type: "subscription",
            amount: 49,
            quantity: 100,
            startDate: "2026-06-01",
          },
        ],
        funding_rounds: [
          { name: "Seed", type: "seed", amount: 1_000_000, date: "2026-06-01" },
        ],
        headcount: [
          {
            title: "Engineer",
            department: "Engineering",
            employeeType: "full_time",
            salary: 120000,
            startDate: "2026-06-01",
          },
        ],
      }),
    );

    expect(res.status).toBe(201);
    expect(rowsFor("revenueStreams")).toHaveLength(0);
    expect(rowsFor("fundingRounds")).toHaveLength(0);
    expect(rowsFor("headcountPlans")).toHaveLength(0);
    expect(rowsFor("forecastLines")).toHaveLength(0);
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
