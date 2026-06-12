/**
 * Tests for GET /api/option-pools and POST /api/option-pools.
 * Cap-table structure is base-data-only (NOT scenario-editable): POST with an
 * active scenario returns 409. Single-pool guard (Phase 3 F §F5): a 2nd
 * non-deleted pool is rejected 409 SINGLE_POOL_ONLY at the write layer.
 * Mirrors share-classes.test.ts vi.hoisted mocks.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireCompanyAccess, mockRequireRole } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockRequireRole: vi.fn().mockReturnValue(null),
}));

const { mockListOptionPools, mockCreateOptionPool, mockCountOptionPools } = vi.hoisted(() => ({
  mockListOptionPools: vi.fn(),
  mockCreateOptionPool: vi.fn(),
  mockCountOptionPools: vi.fn(),
}));

const { mockGetActiveScenario } = vi.hoisted(() => ({
  mockGetActiveScenario: vi.fn(),
}));

const { mockRevalidateTag, mockLogAudit, mockTrackDataMutation } = vi.hoisted(() => ({
  mockRevalidateTag: vi.fn(),
  mockLogAudit: vi.fn(),
  mockTrackDataMutation: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  requireRole: mockRequireRole,
  parseBody: async (req: Request, schema: { parse: (d: unknown) => unknown }) => {
    try { return { data: schema.parse(await req.json()) }; }
    catch { return { error: NextResponse.json({ error: "Validation failed" }, { status: 400 }) }; }
  },
  errorResponse: (msg: string, status: number) => NextResponse.json({ error: msg }, { status }),
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock("@burnless/db", () => ({
  listOptionPools: mockListOptionPools,
  createOptionPool: mockCreateOptionPool,
  countOptionPools: mockCountOptionPools,
}));

vi.mock("next/cache", () => ({ revalidateTag: mockRevalidateTag }));
vi.mock("@/lib/audit", () => ({ logAudit: mockLogAudit }));
vi.mock("@/lib/data-mutation-tracker", () => ({ trackDataMutation: mockTrackDataMutation }));
vi.mock("@/lib/scenario-middleware", () => ({ getActiveScenario: mockGetActiveScenario }));

import { GET, POST } from "../route";

function jsonRequest(url: string, method: string, body?: unknown): Request {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return new Request(url, opts);
}

const VALID_POOL = { name: "2024 Pool", totalReserved: 1_000_000 };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireCompanyAccess.mockResolvedValue({ userId: "user-1", companyId: "comp-1", role: "owner" });
  mockRequireRole.mockReturnValue(null);
  mockGetActiveScenario.mockReturnValue(null);
  mockCountOptionPools.mockResolvedValue(0);
});

describe("GET /api/option-pools", () => {
  it("returns 401 when unauthenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const res = await GET(jsonRequest("http://localhost/api/option-pools", "GET"));
    expect(res.status).toBe(401);
  });

  it("returns option pools for the company", async () => {
    const rows = [{ id: "op-1", name: "2024 Pool", totalReserved: "1000000" }];
    mockListOptionPools.mockResolvedValue(rows);

    const res = await GET(jsonRequest("http://localhost/api/option-pools", "GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(mockListOptionPools).toHaveBeenCalledWith("comp-1");
  });
});

describe("POST /api/option-pools", () => {
  it("creates the first pool (201) with STRING-coerced totalReserved", async () => {
    const created = { id: "op-new", name: "2024 Pool", totalReserved: "1000000", companyId: "comp-1" };
    mockCreateOptionPool.mockResolvedValue(created);

    const res = await POST(jsonRequest("http://localhost/api/option-pools", "POST", VALID_POOL));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("op-new");

    // totalReserved is numeric(18,0) — STRING at the DB boundary
    expect(mockCreateOptionPool).toHaveBeenCalledWith(
      "comp-1",
      expect.objectContaining({ name: "2024 Pool", totalReserved: "1000000", refreshDate: null }),
    );

    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.anything(),
      "option_pool",
      "op-new",
      "create",
      expect.objectContaining({ after: created }),
    );
    expect(mockTrackDataMutation).toHaveBeenCalledWith("comp-1", "funding");
    expect(mockRevalidateTag).toHaveBeenCalledWith("cap-table", { expire: 0 });
  });

  it("returns 409 SINGLE_POOL_ONLY when a pool already exists", async () => {
    mockCountOptionPools.mockResolvedValue(1);
    const res = await POST(jsonRequest("http://localhost/api/option-pools", "POST", VALID_POOL));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("SINGLE_POOL_ONLY");
    expect(mockCreateOptionPool).not.toHaveBeenCalled();
  });

  it("returns 403 for viewer role", async () => {
    mockRequireRole.mockReturnValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    const res = await POST(jsonRequest("http://localhost/api/option-pools", "POST", VALID_POOL));
    expect(res.status).toBe(403);
    expect(mockCreateOptionPool).not.toHaveBeenCalled();
  });

  it("returns 409 when a scenario is active (base-data-only)", async () => {
    mockGetActiveScenario.mockReturnValue("scn-1");
    const res = await POST(jsonRequest("http://localhost/api/option-pools", "POST", VALID_POOL));
    expect(res.status).toBe(409);
    expect(mockCreateOptionPool).not.toHaveBeenCalled();
  });
});
