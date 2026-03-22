/**
 * Tests for /api/forecast-lines and /api/forecast-lines/[id] routes.
 *
 * Covers GET (list), POST (create), PATCH (update), and DELETE operations
 * with auth, role-based access control, and validation checks.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

/* ------------------------------------------------------------------ */
/* Hoisted mocks                                                      */
/* ------------------------------------------------------------------ */

const { mockRequireCompanyAccess, mockRequireRole } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockRequireRole: vi.fn().mockReturnValue(null),
}));

const {
  mockSelect,
  mockFrom,
  mockWhere,
  mockLimit,
  mockInsert,
  mockValues,
  mockReturning,
  mockUpdate,
  mockSet,
  mockDelete,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockLimit: vi.fn(),
  mockInsert: vi.fn(),
  mockValues: vi.fn(),
  mockReturning: vi.fn(),
  mockUpdate: vi.fn(),
  mockSet: vi.fn(),
  mockDelete: vi.fn(),
}));

const { mockGetScenarioForCompany } = vi.hoisted(() => ({
  mockGetScenarioForCompany: vi.fn(),
}));

/* ------------------------------------------------------------------ */
/* Module mocks                                                       */
/* ------------------------------------------------------------------ */

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  requireRole: mockRequireRole,
  parseBody: async (req: Request, schema: { parse: (d: unknown) => unknown }) => {
    try {
      const body = await req.json();
      return { data: schema.parse(body) };
    } catch {
      return { error: NextResponse.json({ error: "Validation failed" }, { status: 400 }) };
    }
  },
  errorResponse: (msg: string, status: number) =>
    NextResponse.json({ error: msg }, { status }),
  withErrorHandler: (fn: Function) => fn,
}));

vi.mock("@burnless/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
  },
  forecastLines: { scenarioId: "scenarioId", id: "id" },
  scenarios: { id: "id", companyId: "companyId" },
  getScenarioForCompany: mockGetScenarioForCompany,
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  lt: vi.fn(),
  inArray: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(), logAuditBatch: vi.fn() }));
vi.mock("@/lib/pagination", () => ({
  parsePaginationParams: () => ({ limit: 50, cursor: null }),
  paginatedResponse: (rows: unknown[], limit: number) => ({
    data: rows.slice(0, limit),
    hasMore: rows.length > limit,
  }),
}));

/* ------------------------------------------------------------------ */
/* Route imports (AFTER mocks are registered)                         */
/* ------------------------------------------------------------------ */

import { GET, POST } from "../route";
import { PATCH, DELETE } from "../[id]/route";

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function jsonRequest(url: string, method: string, body?: unknown): Request {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return new Request(url, opts);
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

const CTX = { userId: "u1", companyId: "c1", role: "admin" };

const sampleLine = {
  id: "fl-1",
  scenarioId: "s1",
  accountId: "a1",
  method: "fixed",
  parameters: { amount: 5000 },
  startDate: new Date("2026-01-01"),
  endDate: null,
};

/* ------------------------------------------------------------------ */
/* GET /api/forecast-lines                                            */
/* ------------------------------------------------------------------ */

describe("GET /api/forecast-lines", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const res = await GET(jsonRequest("http://localhost/api/forecast-lines?scenarioId=s1", "GET"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when scenarioId is missing", async () => {
    mockRequireCompanyAccess.mockResolvedValue(CTX);

    const res = await GET(jsonRequest("http://localhost/api/forecast-lines", "GET"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("scenarioId");
  });

  it("returns 404 when scenario not found for company", async () => {
    mockRequireCompanyAccess.mockResolvedValue(CTX);
    mockGetScenarioForCompany.mockResolvedValue(null);

    const res = await GET(jsonRequest("http://localhost/api/forecast-lines?scenarioId=s-bad", "GET"));
    expect(res.status).toBe(404);
  });

  it("returns forecast lines for valid scenario", async () => {
    mockRequireCompanyAccess.mockResolvedValue(CTX);
    mockGetScenarioForCompany.mockResolvedValue({ id: "s1", companyId: "c1" });
    mockLimit.mockResolvedValue([sampleLine]);

    const res = await GET(jsonRequest("http://localhost/api/forecast-lines?scenarioId=s1", "GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */
/* POST /api/forecast-lines                                           */
/* ------------------------------------------------------------------ */

describe("POST /api/forecast-lines", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockReturnValue(null);
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({ returning: mockReturning });
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const res = await POST(
      jsonRequest("http://localhost/api/forecast-lines", "POST", {
        scenarioId: "s1",
        accountId: "a1",
        startDate: "2026-01-01",
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks editor role", async () => {
    mockRequireCompanyAccess.mockResolvedValue({ ...CTX, role: "viewer" });
    mockRequireRole.mockReturnValue(
      NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    );

    const res = await POST(
      jsonRequest("http://localhost/api/forecast-lines", "POST", {
        scenarioId: "s1",
        accountId: "a1",
        startDate: "2026-01-01",
      })
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when scenario not found", async () => {
    mockRequireCompanyAccess.mockResolvedValue(CTX);
    mockGetScenarioForCompany.mockResolvedValue(null);

    const res = await POST(
      jsonRequest("http://localhost/api/forecast-lines", "POST", {
        scenarioId: "bad-scenario",
        accountId: "a1",
        startDate: "2026-01-01",
      })
    );
    expect(res.status).toBe(404);
  });

  it("creates a forecast line successfully", async () => {
    mockRequireCompanyAccess.mockResolvedValue(CTX);
    mockGetScenarioForCompany.mockResolvedValue({ id: "s1", companyId: "c1" });
    mockReturning.mockResolvedValue([sampleLine]);

    const res = await POST(
      jsonRequest("http://localhost/api/forecast-lines", "POST", {
        scenarioId: "s1",
        accountId: "a1",
        startDate: "2026-01-01",
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("fl-1");
  });
});

/* ------------------------------------------------------------------ */
/* PATCH /api/forecast-lines/[id]                                     */
/* ------------------------------------------------------------------ */

describe("PATCH /api/forecast-lines/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockReturnValue(null);
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ returning: mockReturning });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const res = await PATCH(
      jsonRequest("http://localhost/api/forecast-lines/fl-1", "PATCH", { method: "growth_rate" }),
      makeParams("fl-1")
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks editor role", async () => {
    mockRequireCompanyAccess.mockResolvedValue({ ...CTX, role: "viewer" });
    mockRequireRole.mockReturnValue(
      NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    );

    const res = await PATCH(
      jsonRequest("http://localhost/api/forecast-lines/fl-1", "PATCH", { method: "fixed" }),
      makeParams("fl-1")
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when forecast line not found", async () => {
    mockRequireCompanyAccess.mockResolvedValue(CTX);
    mockReturning.mockResolvedValue([]);

    const res = await PATCH(
      jsonRequest("http://localhost/api/forecast-lines/fl-missing", "PATCH", { method: "fixed" }),
      makeParams("fl-missing")
    );
    expect(res.status).toBe(404);
  });

  it("updates a forecast line successfully", async () => {
    mockRequireCompanyAccess.mockResolvedValue(CTX);
    const updated = { ...sampleLine, method: "growth_rate", parameters: { rate: 0.1 } };
    mockReturning.mockResolvedValue([updated]);

    const res = await PATCH(
      jsonRequest("http://localhost/api/forecast-lines/fl-1", "PATCH", {
        method: "growth_rate",
        parameters: { rate: 0.1 },
      }),
      makeParams("fl-1")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.method).toBe("growth_rate");
  });

  it("returns 400 on invalid method enum", async () => {
    mockRequireCompanyAccess.mockResolvedValue(CTX);

    const res = await PATCH(
      jsonRequest("http://localhost/api/forecast-lines/fl-1", "PATCH", { method: "invalid_method" }),
      makeParams("fl-1")
    );
    expect(res.status).toBe(400);
  });
});

/* ------------------------------------------------------------------ */
/* DELETE /api/forecast-lines/[id]                                    */
/* ------------------------------------------------------------------ */

describe("DELETE /api/forecast-lines/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockReturnValue(null);
    mockDelete.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ returning: mockReturning });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const res = await DELETE(
      jsonRequest("http://localhost/api/forecast-lines/fl-1", "DELETE"),
      makeParams("fl-1")
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks admin role", async () => {
    mockRequireCompanyAccess.mockResolvedValue({ ...CTX, role: "editor" });
    mockRequireRole.mockReturnValue(
      NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    );

    const res = await DELETE(
      jsonRequest("http://localhost/api/forecast-lines/fl-1", "DELETE"),
      makeParams("fl-1")
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when forecast line not found", async () => {
    mockRequireCompanyAccess.mockResolvedValue(CTX);
    mockReturning.mockResolvedValue([]);

    const res = await DELETE(
      jsonRequest("http://localhost/api/forecast-lines/fl-missing", "DELETE"),
      makeParams("fl-missing")
    );
    expect(res.status).toBe(404);
  });

  it("deletes a forecast line successfully", async () => {
    mockRequireCompanyAccess.mockResolvedValue(CTX);
    mockReturning.mockResolvedValue([sampleLine]);

    const res = await DELETE(
      jsonRequest("http://localhost/api/forecast-lines/fl-1", "DELETE"),
      makeParams("fl-1")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
  });

  it("requires admin role (not just editor)", async () => {
    mockRequireCompanyAccess.mockResolvedValue({ ...CTX, role: "editor" });
    // The route calls requireRole(ctx, "admin"), not "editor"
    mockRequireRole.mockReturnValue(
      NextResponse.json({ error: "Admin required for delete" }, { status: 403 })
    );

    const res = await DELETE(
      jsonRequest("http://localhost/api/forecast-lines/fl-1", "DELETE"),
      makeParams("fl-1")
    );
    expect(res.status).toBe(403);
  });
});
