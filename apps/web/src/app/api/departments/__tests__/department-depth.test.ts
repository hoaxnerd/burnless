/**
 * Tests for department hierarchy depth cap (3 levels).
 * Mocks the depth helpers so the route logic is exercised in isolation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireCompanyAccess, mockRequireRole } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockRequireRole: vi.fn().mockReturnValue(null),
}));

const { mockScenarioInsert, mockScenarioUpdate } = vi.hoisted(() => ({
  mockScenarioInsert: vi.fn(),
  mockScenarioUpdate: vi.fn(),
}));

const { mockGetActiveScenario } = vi.hoisted(() => ({
  mockGetActiveScenario: vi.fn(),
}));

const { mockDepthAtParent, mockSubtreeDepthFrom } = vi.hoisted(() => ({
  mockDepthAtParent: vi.fn(),
  mockSubtreeDepthFrom: vi.fn(),
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
  db: { select: vi.fn() },
  departments: { companyId: "companyId", id: "id", parentId: "parentId" },
  resolveEntities: vi.fn(),
  scenarioInsert: mockScenarioInsert,
  scenarioUpdate: mockScenarioUpdate,
  scenarioDelete: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn(), gt: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/data-mutation-tracker", () => ({ trackDataMutation: vi.fn() }));
vi.mock("@/lib/scenario-middleware", () => ({ getActiveScenario: mockGetActiveScenario }));
vi.mock("@/lib/department-depth", () => ({
  DEPT_MAX_DEPTH: 3,
  depthAtParent: mockDepthAtParent,
  subtreeDepthFrom: mockSubtreeDepthFrom,
}));

import { POST } from "../route";
import { PATCH } from "../[id]/route";

function jsonRequest(url: string, method: string, body?: unknown): Request {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return new Request(url, opts);
}

function makeParams(id: string) { return { params: Promise.resolve({ id }) }; }

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireCompanyAccess.mockResolvedValue({ userId: "user-1", companyId: "comp-1", role: "owner" });
  mockRequireRole.mockReturnValue(null);
  mockGetActiveScenario.mockReturnValue(null);
  mockSubtreeDepthFrom.mockResolvedValue(1);
});

describe("POST /api/departments — depth cap", () => {
  it("rejects POST when adding a 4th-level child", async () => {
    mockDepthAtParent.mockResolvedValueOnce(4);
    const res = await POST(
      jsonRequest("http://localhost/api/departments", "POST", {
        name: "DeepChild",
        parentId: "level-3-id",
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("DEPT_DEPTH_EXCEEDED");
    expect(mockScenarioInsert).not.toHaveBeenCalled();
  });

  it("accepts POST at depth 3", async () => {
    mockDepthAtParent.mockResolvedValueOnce(3);
    mockScenarioInsert.mockResolvedValue({
      id: "dept-new",
      companyId: "comp-1",
      name: "Team A",
      parentId: "sub-1",
    });
    const res = await POST(
      jsonRequest("http://localhost/api/departments", "POST", {
        name: "Team A",
        parentId: "sub-1",
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("dept-new");
    expect(mockScenarioInsert).toHaveBeenCalled();
  });

  it("accepts root POST (depth 1)", async () => {
    mockDepthAtParent.mockResolvedValueOnce(1);
    mockScenarioInsert.mockResolvedValue({
      id: "dept-root",
      companyId: "comp-1",
      name: "Engineering",
      parentId: null,
    });
    const res = await POST(
      jsonRequest("http://localhost/api/departments", "POST", { name: "Engineering" }),
    );
    expect(res.status).toBe(201);
    expect(mockDepthAtParent).toHaveBeenCalledWith("comp-1", null);
  });
});

describe("PATCH /api/departments/[id] — depth cap", () => {
  it("rejects re-parenting that would cause depth > 3", async () => {
    // node currently has subtree depth 2 → moved under depth-3 parent → 3+2-1 = 4
    mockDepthAtParent.mockResolvedValueOnce(3);
    mockSubtreeDepthFrom.mockResolvedValueOnce(2);
    const res = await PATCH(
      jsonRequest("http://localhost/api/departments/dept-1", "PATCH", { parentId: "deep-parent" }),
      makeParams("dept-1"),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("DEPT_DEPTH_EXCEEDED");
    expect(mockScenarioUpdate).not.toHaveBeenCalled();
  });

  it("accepts re-parenting when subtree fits (3+1-1=3)", async () => {
    mockDepthAtParent.mockResolvedValueOnce(3);
    mockSubtreeDepthFrom.mockResolvedValueOnce(1);
    mockScenarioUpdate.mockResolvedValue({ id: "dept-1", parentId: "sub-1" });
    const res = await PATCH(
      jsonRequest("http://localhost/api/departments/dept-1", "PATCH", { parentId: "sub-1" }),
      makeParams("dept-1"),
    );
    expect(res.status).toBe(200);
    expect(mockScenarioUpdate).toHaveBeenCalled();
  });

  it("rejects self-parenting", async () => {
    const res = await PATCH(
      jsonRequest("http://localhost/api/departments/dept-1", "PATCH", { parentId: "dept-1" }),
      makeParams("dept-1"),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("DEPT_SELF_PARENT");
    expect(mockDepthAtParent).not.toHaveBeenCalled();
    expect(mockScenarioUpdate).not.toHaveBeenCalled();
  });

  it("skips depth check when parentId is not in payload", async () => {
    mockScenarioUpdate.mockResolvedValue({ id: "dept-1", name: "Renamed" });
    const res = await PATCH(
      jsonRequest("http://localhost/api/departments/dept-1", "PATCH", { name: "Renamed" }),
      makeParams("dept-1"),
    );
    expect(res.status).toBe(200);
    expect(mockDepthAtParent).not.toHaveBeenCalled();
    expect(mockSubtreeDepthFrom).not.toHaveBeenCalled();
  });

  it("allows re-parenting to root (parentId: null)", async () => {
    mockDepthAtParent.mockResolvedValueOnce(1);
    mockSubtreeDepthFrom.mockResolvedValueOnce(2);
    mockScenarioUpdate.mockResolvedValue({ id: "dept-1", parentId: null });
    const res = await PATCH(
      jsonRequest("http://localhost/api/departments/dept-1", "PATCH", { parentId: null }),
      makeParams("dept-1"),
    );
    expect(res.status).toBe(200);
    expect(mockScenarioUpdate).toHaveBeenCalled();
  });
});
