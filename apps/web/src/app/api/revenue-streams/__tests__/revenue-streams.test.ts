/**
 * Integration tests for /api/revenue-streams and /api/revenue-streams/[id] routes.
 *
 * Covers GET (list with scenarioId validation), POST (create),
 * PATCH (update), and DELETE with auth, RBAC, and validation checks.
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
  mockOrderBy,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockLimit: vi.fn(),
  mockOrderBy: vi.fn(),
  mockInsert: vi.fn(),
  mockValues: vi.fn(),
  mockReturning: vi.fn(),
  mockUpdate: vi.fn(),
  mockSet: vi.fn(),
  mockDelete: vi.fn(),
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
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock("@burnless/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
  },
  revenueStreams: { scenarioId: "scenarioId", id: "id" },
  scenarios: { id: "id", companyId: "companyId" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  inArray: vi.fn(),
  isNull: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(), logAuditBatch: vi.fn() }));

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

const VALID_REVENUE_STREAM = {
  scenarioId: "scen-1",
  name: "SaaS Subscriptions",
  type: "subscription" as const,
  parameters: { price: 49, growthRate: 0.1 },
};

/* ------------------------------------------------------------------ */
/* Setup                                                              */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();

  // Default: authenticated owner
  mockRequireCompanyAccess.mockResolvedValue({
    userId: "user-1",
    companyId: "comp-1",
    role: "owner",
  });
  mockRequireRole.mockReturnValue(null);

  // Re-chain DB mocks
  mockSelect.mockReturnValue({ from: mockFrom });
  mockFrom.mockReturnValue({ where: mockWhere });
  mockWhere.mockReturnValue({ limit: mockLimit, orderBy: mockOrderBy, returning: mockReturning });
  mockOrderBy.mockReturnValue({ limit: mockLimit });
  mockInsert.mockReturnValue({ values: mockValues });
  mockValues.mockReturnValue({ returning: mockReturning });
  mockUpdate.mockReturnValue({ set: mockSet });
  mockSet.mockReturnValue({ where: mockWhere });
  mockDelete.mockReturnValue({ where: mockWhere });
});

/* ================================================================== */
/* GET /api/revenue-streams                                           */
/* ================================================================== */

describe("GET /api/revenue-streams", () => {
  it("returns 401 when unauthenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const res = await GET(
      jsonRequest("http://localhost/api/revenue-streams?scenarioId=scen-1", "GET"),
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 400 when scenarioId is missing", async () => {
    const res = await GET(
      jsonRequest("http://localhost/api/revenue-streams", "GET"),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("scenarioId required");
  });

  it("returns 404 when scenario not found", async () => {
    // Scenario lookup returns empty
    mockWhere.mockResolvedValueOnce([]);

    const res = await GET(
      jsonRequest("http://localhost/api/revenue-streams?scenarioId=scen-missing", "GET"),
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Scenario not found");
  });

  it("returns revenue streams for valid scenario", async () => {
    const streams = [
      { id: "rs-1", name: "SaaS", type: "subscription" },
      { id: "rs-2", name: "Consulting", type: "services" },
    ];

    // First call: scenario lookup succeeds
    mockWhere.mockResolvedValueOnce([{ id: "scen-1" }]);
    // Second call: revenue streams list
    mockWhere.mockResolvedValueOnce(streams);

    const res = await GET(
      jsonRequest("http://localhost/api/revenue-streams?scenarioId=scen-1", "GET"),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(streams);
    expect(body).toHaveLength(2);
    expect(mockSelect).toHaveBeenCalledTimes(2);
  });
});

/* ================================================================== */
/* POST /api/revenue-streams                                          */
/* ================================================================== */

describe("POST /api/revenue-streams", () => {
  it("creates a revenue stream (201)", async () => {
    const created = { id: "rs-new", ...VALID_REVENUE_STREAM };

    // Scenario lookup succeeds
    mockWhere.mockResolvedValueOnce([{ id: "scen-1" }]);
    // Insert returns the new row
    mockReturning.mockResolvedValue([created]);

    const res = await POST(
      jsonRequest("http://localhost/api/revenue-streams", "POST", VALID_REVENUE_STREAM),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("rs-new");
    expect(body.name).toBe("SaaS Subscriptions");
    expect(mockInsert).toHaveBeenCalled();
  });

  it("returns 403 for viewer role", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "viewer",
    });
    mockRequireRole.mockReturnValue(
      NextResponse.json({ error: "Forbidden: requires editor role or higher" }, { status: 403 }),
    );

    const res = await POST(
      jsonRequest("http://localhost/api/revenue-streams", "POST", VALID_REVENUE_STREAM),
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("Forbidden");
  });

  it("returns 404 when scenario not found", async () => {
    // Scenario lookup returns empty
    mockWhere.mockResolvedValueOnce([]);

    const res = await POST(
      jsonRequest("http://localhost/api/revenue-streams", "POST", VALID_REVENUE_STREAM),
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Scenario not found");
  });
});

/* ================================================================== */
/* PATCH /api/revenue-streams/[id]                                    */
/* ================================================================== */

describe("PATCH /api/revenue-streams/[id]", () => {
  it("updates a revenue stream", async () => {
    const updated = { id: "rs-1", name: "Enterprise SaaS", type: "subscription" };
    mockReturning.mockResolvedValue([updated]);

    const res = await PATCH(
      jsonRequest("http://localhost/api/revenue-streams/rs-1", "PATCH", {
        name: "Enterprise SaaS",
      }),
      makeParams("rs-1"),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Enterprise SaaS");
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("returns 404 when revenue stream not found", async () => {
    mockReturning.mockResolvedValue([undefined]);

    const res = await PATCH(
      jsonRequest("http://localhost/api/revenue-streams/rs-missing", "PATCH", {
        name: "Nope",
      }),
      makeParams("rs-missing"),
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Revenue stream not found");
  });
});

/* ================================================================== */
/* DELETE /api/revenue-streams/[id]                                   */
/* ================================================================== */

describe("DELETE /api/revenue-streams/[id]", () => {
  it("deletes a revenue stream", async () => {
    mockReturning.mockResolvedValue([{ id: "rs-1" }]);

    const res = await DELETE(
      jsonRequest("http://localhost/api/revenue-streams/rs-1", "DELETE"),
      makeParams("rs-1"),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
    expect(mockDelete).toHaveBeenCalled();
  });

  it("returns 403 for editor role (requires admin)", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "editor",
    });
    mockRequireRole.mockReturnValue(
      NextResponse.json({ error: "Forbidden: requires admin role or higher" }, { status: 403 }),
    );

    const res = await DELETE(
      jsonRequest("http://localhost/api/revenue-streams/rs-1", "DELETE"),
      makeParams("rs-1"),
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("Forbidden");
  });
});
