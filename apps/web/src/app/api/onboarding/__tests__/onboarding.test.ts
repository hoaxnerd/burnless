/**
 * Unit tests for POST /api/onboarding
 *
 * Tests auth, validation, idempotency, company creation, and financial setup.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

/* ── Hoisted mocks ─────────────────────────────────────────────────── */

const { mockGetAuthUser, mockGetUserCompany, mockRevalidateTag } = vi.hoisted(() => ({
  mockGetAuthUser: vi.fn(),
  mockGetUserCompany: vi.fn(),
  mockRevalidateTag: vi.fn(),
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
  // Deterministic install-company id (self-host). Must match the real export.
  LOCAL_OWNER_COMPANY_ID: "00000000-0000-4000-a000-000000000001",
  companies: { __table: "companies", id: "id", name: "name" },
  companyMembers: { __table: "companyMembers" },
  scenarios: { __table: "scenarios", id: "id", companyId: "companyId", deletedAt: "deletedAt" },
  financialAccounts: { __table: "financialAccounts", id: "id", companyId: "companyId" },
  departments: { __table: "departments", id: "id", companyId: "companyId" },
  forecastLines: { __table: "forecastLines" },
  revenueStreams: { __table: "revenueStreams" },
  fundingRounds: { __table: "fundingRounds" },
  headcountPlans: { __table: "headcountPlans" },
  aiFeatureFlags: { __table: "aiFeatureFlags", companyId: "companyId" },
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

vi.mock("next/cache", () => ({
  revalidateTag: mockRevalidateTag,
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

// Must mirror the real LOCAL_OWNER_COMPANY_ID export (also stubbed in the mock).
const INSTALL_COMPANY_ID = "00000000-0000-4000-a000-000000000001";

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

/**
 * Records the CLAIM-path transaction: captures inserts AND updates (the claim
 * UPDATEs the company row), and serves `tx.select(...).from(...).where(...).limit()`
 * for the create-if-absent existence checks. By default every existence check
 * resolves EMPTY → scaffolding gets created (fresh claim). Pass `existing` to
 * mark specific tables as already-present (idempotent re-claim).
 */
function recordClaimTransaction(existing: Set<string> = new Set()) {
  const inserts: { table: string; rows: unknown[] }[] = [];
  const updates: { table: string; set: unknown }[] = [];

  const txSelect = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockImplementation((table: { __table?: string }) => ({
      where: vi.fn().mockReturnValue({
        limit: vi
          .fn()
          .mockResolvedValue(existing.has(table?.__table ?? "") ? [{ id: "pre-existing" }] : []),
      }),
    })),
  }));
  const txInsert = vi.fn().mockImplementation((table: { __table?: string }) => ({
    values: vi.fn().mockImplementation((rows: unknown) => {
      const arr = Array.isArray(rows) ? rows : [rows];
      inserts.push({ table: table?.__table ?? "unknown", rows: arr });
      return {
        returning: vi
          .fn()
          .mockResolvedValue(arr.map((_, i) => ({ id: `${table?.__table}-${i}` }))),
      };
    }),
  }));
  const txUpdate = vi.fn().mockImplementation((table: { __table?: string }) => ({
    set: vi.fn().mockImplementation((s: unknown) => {
      updates.push({ table: table?.__table ?? "unknown", set: s });
      return { where: vi.fn().mockResolvedValue(undefined) };
    }),
  }));

  mockTransaction.mockImplementation(
    async (
      fn: (tx: {
        select: typeof txSelect;
        insert: typeof txInsert;
        update: typeof txUpdate;
      }) => Promise<unknown>,
    ) => fn({ select: txSelect, insert: txInsert, update: txUpdate }),
  );

  const rowsFor = (table: string) =>
    inserts.filter((i) => i.table === table).flatMap((i) => i.rows);
  const updateFor = (table: string) => updates.find((u) => u.table === table);
  return { inserts, updates, rowsFor, updateFor };
}

/**
 * Stub the top-level `isCompanyClaimed` select (db.select → from → where → limit).
 * `claimed=false` → unclaimed install company (claim path); `true` → already claimed.
 */
function stubIsClaimed(claimed: boolean) {
  mockSelect.mockReturnValue({ from: mockFrom });
  mockFrom.mockReturnValue({ where: mockWhere });
  mockWhere.mockReturnValue({ limit: mockLimit });
  mockLimit.mockResolvedValue(claimed ? [{ id: "base-scenario" }] : []);
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

  /* ── Cache invalidation contract (fix #3: empty dashboard on first load) ── */

  // Onboarding is a WRITER of several cached domains (scenarios, accounts,
  // departments). The dashboard reads the active scenario via getDefaultScenario,
  // which is wrapped in unstable_cache tagged "scenarios". Without invalidation a
  // stale `null` (cached before the scenario existed) renders "Create Your First
  // Scenario" on the first soft-nav to /dashboard. The route MUST revalidate.
  it("revalidates the scenarios cache on the CREATE path", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1" });
    mockGetUserCompany.mockResolvedValue(null);

    const txResult = { companyId: "new-co", scenarioId: "new-scenario" };
    mockTransaction.mockImplementation(async () => txResult);

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(201);

    const tags = mockRevalidateTag.mock.calls.map((c) => c[0]);
    expect(tags).toContain("scenarios");
    expect(tags).toContain("accounts");
    expect(tags).toContain("departments");
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

  /* ── CREATE-OR-CLAIM: self-host install company ───────────────────── */

  // Self-host boot auto-creates an install placeholder company
  // (id = LOCAL_OWNER_COMPANY_ID, name "My Company") + owner membership, with NO
  // scaffolding. The wizard's company step CLAIMS it: the row is UPDATED (name
  // set, id unchanged) and scaffolding is created-if-absent. 201, no duplicate
  // company insert.
  it("CLAIMS the unclaimed install company: updates the row + creates scaffolding, 201", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "owner-1" });
    mockGetUserCompany.mockResolvedValue({ companyId: INSTALL_COMPANY_ID, role: "owner" });
    stubIsClaimed(false);

    const { rowsFor, updateFor } = recordClaimTransaction();

    const res = await POST(
      makeRequest({
        company_name: "Acme Corp",
        stage: "Seed",
        business_model: "SaaS",
        industry: "Fintech",
        user_name: "Jane Founder",
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.companyId).toBe(INSTALL_COMPANY_ID);
    expect(body.scenarioId).toBeTruthy();

    // The company row is UPDATED (claimed), not inserted — no duplicate company.
    expect(rowsFor("companies")).toHaveLength(0);
    const companyUpdate = updateFor("companies");
    expect(companyUpdate).toBeTruthy();
    expect((companyUpdate?.set as { name: string }).name).toBe("Acme Corp");

    // Scaffolding created-if-absent: scenario, accounts, departments, flags.
    expect(rowsFor("scenarios")).toHaveLength(1);
    expect((rowsFor("financialAccounts") as unknown[]).length).toBeGreaterThanOrEqual(6);
    expect(rowsFor("departments")).toHaveLength(5);
    expect(rowsFor("aiFeatureFlags")).toHaveLength(1);
  });

  // Same invalidation contract on the CLAIM path: the claim creates the base
  // scenario (the dashboard's read dependency) and must revalidate "scenarios".
  it("revalidates the scenarios cache on the CLAIM path", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "owner-1" });
    mockGetUserCompany.mockResolvedValue({ companyId: INSTALL_COMPANY_ID, role: "owner" });
    stubIsClaimed(false);

    recordClaimTransaction();

    const res = await POST(makeRequest({ company_name: "Acme Corp" }));
    expect(res.status).toBe(201);

    const tags = mockRevalidateTag.mock.calls.map((c) => c[0]);
    expect(tags).toContain("scenarios");
    expect(tags).toContain("accounts");
    expect(tags).toContain("departments");
  });

  // Claim is NON-DESTRUCTIVE: an omitted optional field (industry/user_name)
  // must NOT appear in the SET payload, so it never nulls an existing value.
  it("claim is non-destructive: omitted optional fields are not in the UPDATE set", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "owner-1" });
    mockGetUserCompany.mockResolvedValue({ companyId: INSTALL_COMPANY_ID, role: "owner" });
    stubIsClaimed(false);

    const { updateFor } = recordClaimTransaction();

    // No industry, no user_name in the body.
    const res = await POST(makeRequest({ company_name: "Acme Corp" }));
    expect(res.status).toBe(201);

    const companyUpdate = updateFor("companies");
    const setPayload = companyUpdate?.set as Record<string, unknown>;
    expect(setPayload.name).toBe("Acme Corp");
    // industry omitted → must NOT be present (would otherwise null the column).
    expect("industry" in setPayload).toBe(false);
    // user_name omitted → the users table must not be updated at all.
    expect(updateFor("users")).toBeUndefined();
  });

  // Re-claim is idempotent: when scaffolding already exists for the install
  // company, the claim does NOT duplicate it (create-if-absent guards).
  it("re-claim is idempotent: existing scaffolding is not duplicated", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "owner-1" });
    mockGetUserCompany.mockResolvedValue({ companyId: INSTALL_COMPANY_ID, role: "owner" });
    // Top-level claimed check returns false (no scenario yet — the claim sentinel
    // is created later in the same tx), but the per-table existence checks report
    // accounts + departments already present from a prior partial claim.
    stubIsClaimed(false);

    const { rowsFor } = recordClaimTransaction(
      new Set(["financialAccounts", "departments"]),
    );

    const res = await POST(makeRequest({ company_name: "Acme Corp" }));
    expect(res.status).toBe(201);

    expect(rowsFor("financialAccounts")).toHaveLength(0);
    expect(rowsFor("departments")).toHaveLength(0);
    // Scenario + flags absent → still created.
    expect(rowsFor("scenarios")).toHaveLength(1);
    expect(rowsFor("aiFeatureFlags")).toHaveLength(1);
  });

  // A self-host install company that is ALREADY claimed (base scenario exists)
  // re-submitting → 409 ONBOARDING_ALREADY_COMPLETE, no claim transaction.
  it("returns 409 when the install company is already claimed", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "owner-1" });
    mockGetUserCompany.mockResolvedValue({ companyId: INSTALL_COMPANY_ID, role: "owner" });
    stubIsClaimed(true);

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe("ONBOARDING_ALREADY_COMPLETE");
    expect(body.companyId).toBe(INSTALL_COMPANY_ID);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  // CLOUD path: membership exists but it is NOT the install company → that is a
  // real, already-created company → 409 (unchanged behavior).
  it("returns 409 for an existing non-install company (cloud re-submit)", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1" });
    mockGetUserCompany.mockResolvedValue({ companyId: "cloud-co", role: "owner" });

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe("ONBOARDING_ALREADY_COMPLETE");
    expect(body.companyId).toBe("cloud-co");
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  /* ── Timezone: CREATE path ────────────────────────────────────────── */

  // The client sends Intl.DateTimeFormat().resolvedOptions().timeZone; the route
  // must persist it on the CREATE insert. Assert the inserted company row carries
  // the exact IANA zone string.
  it("CREATE: persists timezone when provided in the body", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1" });
    mockGetUserCompany.mockResolvedValue(null);

    const { rowsFor } = recordTransactionInserts();

    const res = await POST(
      makeRequest({
        company_name: "Acme Corp",
        stage: "Seed",
        business_model: "SaaS",
        timezone: "Asia/Kolkata",
      }),
    );

    expect(res.status).toBe(201);

    const companyRows = rowsFor("companies") as { timezone?: string }[];
    expect(companyRows).toHaveLength(1);
    expect(companyRows[0]?.timezone).toBe("Asia/Kolkata");
  });

  // When timezone is omitted the column default (America/New_York) handles it —
  // undefined in the INSERT values lets Drizzle/the column default take over.
  it("CREATE: does not set timezone when absent (column default preserved)", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1" });
    mockGetUserCompany.mockResolvedValue(null);

    const { rowsFor } = recordTransactionInserts();

    const res = await POST(
      makeRequest({ company_name: "Minimal Corp", stage: "Seed", business_model: "SaaS" }),
    );

    expect(res.status).toBe(201);

    const companyRows = rowsFor("companies") as { timezone?: string }[];
    expect(companyRows).toHaveLength(1);
    // Must be undefined (not "America/New_York" string) so the column default applies.
    expect(companyRows[0]?.timezone).toBeUndefined();
  });

  /* ── Timezone: CLAIM path ─────────────────────────────────────────── */

  // The client sends timezone on CLAIM too; the UPDATE set must include it.
  it("CLAIM: persists timezone in the UPDATE set when provided", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "owner-1" });
    mockGetUserCompany.mockResolvedValue({ companyId: INSTALL_COMPANY_ID, role: "owner" });
    stubIsClaimed(false);

    const { updateFor } = recordClaimTransaction();

    const res = await POST(
      makeRequest({
        company_name: "Acme Corp",
        stage: "Seed",
        business_model: "SaaS",
        timezone: "Asia/Kolkata",
      }),
    );

    expect(res.status).toBe(201);

    const companyUpdate = updateFor("companies");
    expect(companyUpdate).toBeTruthy();
    expect((companyUpdate?.set as { timezone?: string }).timezone).toBe("Asia/Kolkata");
  });

  // Non-destructive: omitted timezone must NOT appear in the UPDATE set.
  it("CLAIM: timezone absent from UPDATE set when not provided (non-destructive)", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "owner-1" });
    mockGetUserCompany.mockResolvedValue({ companyId: INSTALL_COMPANY_ID, role: "owner" });
    stubIsClaimed(false);

    const { updateFor } = recordClaimTransaction();

    const res = await POST(makeRequest({ company_name: "Acme Corp" }));
    expect(res.status).toBe(201);

    const companyUpdate = updateFor("companies");
    const setPayload = companyUpdate?.set as Record<string, unknown>;
    expect("timezone" in setPayload).toBe(false);
  });
});
