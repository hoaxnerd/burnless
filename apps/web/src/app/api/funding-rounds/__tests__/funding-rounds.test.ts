/**
 * Integration tests for /api/funding-rounds and /api/funding-rounds/[id] routes.
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
  withErrorHandler: (fn: Function) => fn,
}));

vi.mock("@burnless/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
  },
  fundingRounds: { companyId: "companyId", id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
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

const VALID_FUNDING_ROUND = {
  name: "Seed Round",
  type: "seed" as const,
  amount: 1_000_000,
  date: "2026-06-01",
  preMoneyValuation: 5_000_000,
  dilutionPercent: 20,
  isProjected: false,
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
/* GET /api/funding-rounds                                            */
/* ================================================================== */

describe("GET /api/funding-rounds", () => {
  it("returns 401 when unauthenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const res = await GET(jsonRequest("http://localhost/api/funding-rounds", "GET"));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns funding rounds list", async () => {
    const rows = [
      { id: "fr-1", name: "Seed", amount: "1000000" },
      { id: "fr-2", name: "Series A", amount: "5000000" },
    ];
    mockWhere.mockResolvedValue(rows);

    const res = await GET(jsonRequest("http://localhost/api/funding-rounds", "GET"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(rows);
    expect(mockRequireCompanyAccess).toHaveBeenCalledOnce();
    expect(mockSelect).toHaveBeenCalled();
  });
});

/* ================================================================== */
/* POST /api/funding-rounds                                           */
/* ================================================================== */

describe("POST /api/funding-rounds", () => {
  it("creates a funding round with valid data (201)", async () => {
    const created = { id: "fr-new", ...VALID_FUNDING_ROUND, companyId: "comp-1" };
    mockReturning.mockResolvedValue([created]);

    const res = await POST(
      jsonRequest("http://localhost/api/funding-rounds", "POST", VALID_FUNDING_ROUND),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("fr-new");
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
      jsonRequest("http://localhost/api/funding-rounds", "POST", VALID_FUNDING_ROUND),
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("Forbidden");
  });

  it("returns 400 for invalid type", async () => {
    const invalid = { ...VALID_FUNDING_ROUND, type: "angel" };

    const res = await POST(
      jsonRequest("http://localhost/api/funding-rounds", "POST", invalid),
    );

    expect(res.status).toBe(400);
  });
});

/* ================================================================== */
/* PATCH /api/funding-rounds/[id]                                     */
/* ================================================================== */

describe("PATCH /api/funding-rounds/[id]", () => {
  it("updates a funding round", async () => {
    const updated = { id: "fr-1", name: "Seed Round Updated", amount: "2000000" };
    mockReturning.mockResolvedValue([updated]);

    const res = await PATCH(
      jsonRequest("http://localhost/api/funding-rounds/fr-1", "PATCH", { name: "Seed Round Updated", amount: 2_000_000 }),
      makeParams("fr-1"),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Seed Round Updated");
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("returns 404 when funding round not found", async () => {
    mockReturning.mockResolvedValue([undefined]);

    const res = await PATCH(
      jsonRequest("http://localhost/api/funding-rounds/missing", "PATCH", { name: "Nope" }),
      makeParams("missing"),
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Funding round not found");
  });
});

/* ================================================================== */
/* DELETE /api/funding-rounds/[id]                                    */
/* ================================================================== */

describe("DELETE /api/funding-rounds/[id]", () => {
  it("deletes a funding round", async () => {
    mockReturning.mockResolvedValue([{ id: "fr-1" }]);

    const res = await DELETE(
      jsonRequest("http://localhost/api/funding-rounds/fr-1", "DELETE"),
      makeParams("fr-1"),
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
      jsonRequest("http://localhost/api/funding-rounds/fr-1", "DELETE"),
      makeParams("fr-1"),
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("Forbidden");
  });

  it("returns 404 when funding round not found", async () => {
    mockReturning.mockResolvedValue([undefined]);

    const res = await DELETE(
      jsonRequest("http://localhost/api/funding-rounds/missing", "DELETE"),
      makeParams("missing"),
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Funding round not found");
  });
});
