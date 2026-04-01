/**
 * Tests for GET/PATCH/DELETE /api/scenarios/[id].
 * Updated for overlay scenario system with override counts and new schema.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireCompanyAccess, mockRequireRole } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockRequireRole: vi.fn().mockReturnValue(null),
}));

const { mockGetOverrideCount } = vi.hoisted(() => ({
  mockGetOverrideCount: vi.fn(),
}));

const {
  mockSelect,
  mockSelectFrom,
  mockSelectWhere,
  mockSelectLimit,
  mockUpdate,
  mockUpdateSet,
  mockUpdateWhere,
  mockUpdateReturning,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockSelectFrom: vi.fn(),
  mockSelectWhere: vi.fn(),
  mockSelectLimit: vi.fn(),
  mockUpdate: vi.fn(),
  mockUpdateSet: vi.fn(),
  mockUpdateWhere: vi.fn(),
  mockUpdateReturning: vi.fn(),
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
  db: { select: mockSelect, update: mockUpdate },
  scenarios: { id: "id", companyId: "companyId", deletedAt: "deletedAt" },
  getOverrideCount: mockGetOverrideCount,
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn(), isNull: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/data-mutation-tracker", () => ({ trackDataMutation: vi.fn() }));

import { GET, PATCH, DELETE } from "../[id]/route";

function jsonRequest(url: string, method: string, body?: unknown): Request {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return new Request(url, opts);
}
function makeParams(id: string) { return { params: Promise.resolve({ id }) }; }

describe("GET /api/scenarios/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockSelectFrom });
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
    mockSelectWhere.mockReturnValue({ limit: mockSelectLimit });
    mockGetOverrideCount.mockResolvedValue(0);
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const res = await GET(jsonRequest("http://localhost/api/scenarios/scen-1", "GET"), makeParams("scen-1"));
    expect(res.status).toBe(401);
  });

  it("returns scenario with overrideCount", async () => {
    mockRequireCompanyAccess.mockResolvedValue({ userId: "user-1", companyId: "comp-1", role: "viewer" });
    mockSelectLimit.mockResolvedValue([{ id: "scen-1", name: "Growth", source: "blank" }]);
    mockGetOverrideCount.mockResolvedValue(5);

    const res = await GET(jsonRequest("http://localhost/api/scenarios/scen-1", "GET"), makeParams("scen-1"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.id).toBe("scen-1");
    expect(body.overrideCount).toBe(5);
  });

  it("returns 404 when not found", async () => {
    mockRequireCompanyAccess.mockResolvedValue({ userId: "user-1", companyId: "comp-1", role: "viewer" });
    mockSelectLimit.mockResolvedValue([]);
    const res = await GET(jsonRequest("http://localhost/api/scenarios/nonexistent", "GET"), makeParams("nonexistent"));
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/scenarios/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockSelectFrom });
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
    mockSelectWhere.mockReturnValue({ limit: mockSelectLimit });
    mockUpdate.mockReturnValue({ set: mockUpdateSet });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockReturnValue({ returning: mockUpdateReturning });
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const res = await PATCH(jsonRequest("http://localhost/api/scenarios/scen-1", "PATCH", { name: "X" }), makeParams("scen-1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for viewer role", async () => {
    mockRequireCompanyAccess.mockResolvedValue({ userId: "user-1", companyId: "comp-1", role: "viewer" });
    mockRequireRole.mockReturnValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    const res = await PATCH(jsonRequest("http://localhost/api/scenarios/scen-1", "PATCH", { name: "X" }), makeParams("scen-1"));
    expect(res.status).toBe(403);
  });

  it("updates scenario with new fields", async () => {
    mockRequireCompanyAccess.mockResolvedValue({ userId: "user-1", companyId: "comp-1", role: "editor" });
    mockRequireRole.mockReturnValue(null);
    mockSelectLimit.mockResolvedValue([{ id: "scen-1", companyId: "comp-1", name: "Growth" }]);
    mockUpdateReturning.mockResolvedValue([{ id: "scen-1", name: "Updated Growth", color: "#00ff00" }]);

    const res = await PATCH(jsonRequest("http://localhost/api/scenarios/scen-1", "PATCH", {
      name: "Updated Growth", color: "#00ff00",
    }), makeParams("scen-1"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.name).toBe("Updated Growth");
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("returns 404 when not found", async () => {
    mockRequireCompanyAccess.mockResolvedValue({ userId: "user-1", companyId: "comp-1", role: "editor" });
    mockRequireRole.mockReturnValue(null);
    mockSelectLimit.mockResolvedValue([]);
    const res = await PATCH(jsonRequest("http://localhost/api/scenarios/nonexistent", "PATCH", { name: "X" }), makeParams("nonexistent"));
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/scenarios/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockReturnValue({ set: mockUpdateSet });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockReturnValue({ returning: mockUpdateReturning });
  });

  it("soft-deletes scenario", async () => {
    mockRequireCompanyAccess.mockResolvedValue({ userId: "user-1", companyId: "comp-1", role: "admin" });
    mockRequireRole.mockReturnValue(null);
    mockUpdateReturning.mockResolvedValue([{ id: "scen-1", deletedAt: new Date() }]);

    const res = await DELETE(jsonRequest("http://localhost/api/scenarios/scen-1", "DELETE"), makeParams("scen-1"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.deleted).toBe(true);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("returns 404 when not found", async () => {
    mockRequireCompanyAccess.mockResolvedValue({ userId: "user-1", companyId: "comp-1", role: "admin" });
    mockRequireRole.mockReturnValue(null);
    mockUpdateReturning.mockResolvedValue([]);
    const res = await DELETE(jsonRequest("http://localhost/api/scenarios/nonexistent", "DELETE"), makeParams("nonexistent"));
    expect(res.status).toBe(404);
  });

  it("returns 403 for editor (requires admin)", async () => {
    mockRequireCompanyAccess.mockResolvedValue({ userId: "user-1", companyId: "comp-1", role: "editor" });
    mockRequireRole.mockReturnValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    const res = await DELETE(jsonRequest("http://localhost/api/scenarios/scen-1", "DELETE"), makeParams("scen-1"));
    expect(res.status).toBe(403);
  });
});
