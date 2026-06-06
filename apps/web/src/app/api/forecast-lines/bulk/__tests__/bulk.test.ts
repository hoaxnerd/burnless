/**
 * Tests for POST /api/forecast-lines/bulk.
 *
 * Two actions: "delete" and "categorize".
 * Both must:
 *  - Validate auth + editor role.
 *  - Filter to the caller's companyId via WHERE clause (cross-company ids
 *    silently drop out — no 403, just count=0).
 *  - Route through scenarioDelete / scenarioUpdate so an active scenario
 *    writes deltas to scenario_overrides instead of touching base rows.
 *  - Validate body via Zod (action discriminator).
 *  - For categorize: validate accountId belongs to the caller's company.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireCompanyAccess, mockRequireRole } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockRequireRole: vi.fn().mockReturnValue(null),
}));

const { mockScenarioUpdate, mockScenarioDelete } = vi.hoisted(() => ({
  mockScenarioUpdate: vi.fn(),
  mockScenarioDelete: vi.fn(),
}));

const { mockGetActiveScenario } = vi.hoisted(() => ({
  mockGetActiveScenario: vi.fn(),
}));

const { mockSelect, mockFrom, mockWhere } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  requireRole: mockRequireRole,
  errorResponse: (msg: string, status: number) =>
    NextResponse.json({ error: msg }, { status }),
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/data-mutation-tracker", () => ({ trackDataMutation: vi.fn() }));

vi.mock("@burnless/db", () => ({
  db: { select: mockSelect },
  forecastLines: { id: "id", companyId: "companyId" },
  financialAccounts: { id: "id", companyId: "companyId" },
  scenarioUpdate: mockScenarioUpdate,
  scenarioDelete: mockScenarioDelete,
}));

vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ op: "eq", a, b }),
  and: (...parts: unknown[]) => ({ op: "and", parts }),
  inArray: (a: unknown, b: unknown) => ({ op: "inArray", a, b }),
}));

vi.mock("@/lib/scenario-middleware", () => ({
  getActiveScenario: mockGetActiveScenario,
}));

import { POST } from "../route";

const CTX = { userId: "u1", companyId: "c1", role: "editor" };

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/forecast-lines/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireCompanyAccess.mockResolvedValue(CTX);
  mockRequireRole.mockReturnValue(null);
  mockGetActiveScenario.mockReturnValue(null);
  mockSelect.mockReturnValue({ from: mockFrom });
  mockFrom.mockReturnValue({ where: mockWhere });
});

describe("POST /api/forecast-lines/bulk — auth + role", () => {
  it("returns 401 when not authenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const res = await POST(
      jsonRequest({ action: "delete", ids: ["fl-1"] }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is below editor", async () => {
    mockRequireRole.mockReturnValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const res = await POST(
      jsonRequest({ action: "delete", ids: ["fl-1"] }),
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /api/forecast-lines/bulk — body validation", () => {
  it("returns 400 for an unknown action", async () => {
    const res = await POST(jsonRequest({ action: "wat", ids: ["fl-1"] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when categorize is missing accountId", async () => {
    const res = await POST(
      jsonRequest({ action: "categorize", ids: ["fl-1"] }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when ids is empty", async () => {
    const res = await POST(jsonRequest({ action: "delete", ids: [] }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/forecast-lines/bulk — delete (no scenario)", () => {
  beforeEach(() => {
    mockGetActiveScenario.mockReturnValue(null);
  });

  it("hard-deletes only ids that belong to this company", async () => {
    // Pre-filter SELECT returns the rows that match (companyId=c1 AND id IN(...))
    mockWhere.mockResolvedValueOnce([
      { id: "fl-1" },
      { id: "fl-2" },
      // fl-foreign was filtered out at the WHERE clause
    ]);
    mockScenarioDelete.mockResolvedValue(undefined);

    const res = await POST(
      jsonRequest({ action: "delete", ids: ["fl-1", "fl-2", "fl-foreign"] }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.count).toBe(2);

    // Should have called scenarioDelete for the two matched ids only
    expect(mockScenarioDelete).toHaveBeenCalledTimes(2);
    expect(mockScenarioDelete).toHaveBeenNthCalledWith(
      1,
      "forecast_line",
      expect.anything(),
      "fl-1",
      null,
      "c1",
    );
    expect(mockScenarioDelete).toHaveBeenNthCalledWith(
      2,
      "forecast_line",
      expect.anything(),
      "fl-2",
      null,
      "c1",
    );
  });
});

describe("POST /api/forecast-lines/bulk — delete (with active scenario)", () => {
  beforeEach(() => {
    mockGetActiveScenario.mockReturnValue("scen-1");
  });

  it("routes deletes through scenarioDelete with the active scenarioId", async () => {
    mockWhere.mockResolvedValueOnce([
      { id: "fl-1" },
      { id: "fl-2" },
    ]);
    mockScenarioDelete.mockResolvedValue(undefined);

    const res = await POST(
      jsonRequest({ action: "delete", ids: ["fl-1", "fl-2"] }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(2);

    // Critical: scenarioId is threaded through so deltas land in
    // scenario_overrides with action='delete' rather than hard-deleting
    // the baseline rows.
    expect(mockScenarioDelete).toHaveBeenCalledWith(
      "forecast_line",
      expect.anything(),
      "fl-1",
      "scen-1",
      "c1",
    );
    expect(mockScenarioDelete).toHaveBeenCalledWith(
      "forecast_line",
      expect.anything(),
      "fl-2",
      "scen-1",
      "c1",
    );
  });
});

describe("POST /api/forecast-lines/bulk — categorize", () => {
  beforeEach(() => {
    mockGetActiveScenario.mockReturnValue(null);
  });

  it("updates accountId on rows that belong to this company", async () => {
    // First select: validate accountId belongs to company → returns 1 row
    mockWhere.mockResolvedValueOnce([{ id: "acc-new" }]);
    // Second select: forecast lines matching companyId AND id IN (...)
    mockWhere.mockResolvedValueOnce([
      { id: "fl-1" },
      { id: "fl-2" },
    ]);
    mockScenarioUpdate.mockImplementation(
      async (_t: string, _tbl: unknown, id: string) => ({
        id,
        accountId: "acc-new",
      }),
    );

    const res = await POST(
      jsonRequest({
        action: "categorize",
        ids: ["fl-1", "fl-2", "fl-foreign"],
        accountId: "acc-new",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.count).toBe(2);

    expect(mockScenarioUpdate).toHaveBeenCalledTimes(2);
    expect(mockScenarioUpdate).toHaveBeenCalledWith(
      "forecast_line",
      expect.anything(),
      "fl-1",
      { accountId: "acc-new" },
      null,
      "c1",
    );
  });

  it("rejects categorize when accountId belongs to a different company", async () => {
    // SELECT for accountId returns no rows (foreign account)
    mockWhere.mockResolvedValueOnce([]);

    const res = await POST(
      jsonRequest({
        action: "categorize",
        ids: ["fl-1"],
        accountId: "acc-foreign",
      }),
    );
    expect(res.status).toBe(403);
    expect(mockScenarioUpdate).not.toHaveBeenCalled();
  });

  it("threads the active scenario through scenarioUpdate", async () => {
    mockGetActiveScenario.mockReturnValue("scen-1");
    mockWhere.mockResolvedValueOnce([{ id: "acc-new" }]);
    mockWhere.mockResolvedValueOnce([{ id: "fl-1" }]);
    mockScenarioUpdate.mockResolvedValue({ id: "fl-1" });

    await POST(
      jsonRequest({
        action: "categorize",
        ids: ["fl-1"],
        accountId: "acc-new",
      }),
    );
    expect(mockScenarioUpdate).toHaveBeenCalledWith(
      "forecast_line",
      expect.anything(),
      "fl-1",
      { accountId: "acc-new" },
      "scen-1",
      "c1",
    );
  });
});
