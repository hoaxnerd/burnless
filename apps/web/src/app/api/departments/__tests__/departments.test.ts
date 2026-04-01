/**
 * Tests for GET /api/departments and POST /api/departments.
 * Updated for overlay scenario system.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireCompanyAccess, mockRequireRole } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockRequireRole: vi.fn().mockReturnValue(null),
}));

const { mockSelect, mockFrom, mockWhere, mockResolveEntities, mockScenarioInsert } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockResolveEntities: vi.fn(),
  mockScenarioInsert: vi.fn(),
}));

const { mockGetActiveScenario } = vi.hoisted(() => ({
  mockGetActiveScenario: vi.fn(),
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
  db: { select: mockSelect },
  departments: { companyId: "companyId", id: "id" },
  resolveEntities: mockResolveEntities,
  scenarioInsert: mockScenarioInsert,
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn(), gt: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/data-mutation-tracker", () => ({ trackDataMutation: vi.fn() }));
vi.mock("@/lib/scenario-middleware", () => ({ getActiveScenario: mockGetActiveScenario }));

import { GET, POST } from "../route";

function jsonRequest(url: string, method: string, body?: unknown): Request {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return new Request(url, opts);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireCompanyAccess.mockResolvedValue({ userId: "user-1", companyId: "comp-1", role: "owner" });
  mockRequireRole.mockReturnValue(null);
  mockGetActiveScenario.mockReturnValue(null);
  mockSelect.mockReturnValue({ from: mockFrom });
  mockFrom.mockReturnValue({ where: mockWhere });
});

describe("GET /api/departments", () => {
  it("returns 401 when unauthenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const res = await GET(jsonRequest("http://localhost/api/departments", "GET"));
    expect(res.status).toBe(401);
  });

  it("returns resolved departments list", async () => {
    const base = [
      { id: "dept-1", companyId: "comp-1", name: "Engineering", parentId: null },
      { id: "dept-2", companyId: "comp-1", name: "Marketing", parentId: null },
    ];
    mockWhere.mockResolvedValue(base);
    mockResolveEntities.mockResolvedValue(base.map((e) => ({ ...e, _override: null })));

    const res = await GET(jsonRequest("http://localhost/api/departments", "GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].name).toBe("Engineering");
    expect(mockResolveEntities).toHaveBeenCalledWith("department", base, null);
  });
});

describe("POST /api/departments", () => {
  it("creates department via scenarioInsert (201)", async () => {
    const created = { id: "dept-new", companyId: "comp-1", name: "Design", parentId: null };
    mockScenarioInsert.mockResolvedValue(created);

    const res = await POST(jsonRequest("http://localhost/api/departments", "POST", { name: "Design" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("dept-new");
    expect(mockScenarioInsert).toHaveBeenCalledWith(
      "department", expect.anything(),
      expect.objectContaining({ name: "Design", companyId: "comp-1" }),
      null,
    );
  });

  it("returns 403 for viewer role", async () => {
    mockRequireRole.mockReturnValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    const res = await POST(jsonRequest("http://localhost/api/departments", "POST", { name: "X" }));
    expect(res.status).toBe(403);
    expect(mockScenarioInsert).not.toHaveBeenCalled();
  });

  it("returns 400 for missing name", async () => {
    const res = await POST(jsonRequest("http://localhost/api/departments", "POST", {}));
    expect(res.status).toBe(400);
  });
});
