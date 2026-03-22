import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireCompanyAccess, mockRequireRole, mockGetCompanyPlan } =
  vi.hoisted(() => ({
    mockRequireCompanyAccess: vi.fn(),
    mockRequireRole: vi.fn().mockReturnValue(null),
    mockGetCompanyPlan: vi.fn(),
  }));

const {
  mockSelect,
  mockFrom,
  mockWhere,
  mockOrderBy,
  mockInsert,
  mockValues,
  mockReturning,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockOrderBy: vi.fn(),
  mockInsert: vi.fn(),
  mockValues: vi.fn(),
  mockReturning: vi.fn(),
}));

const { mockCanPerformAction } = vi.hoisted(() => ({
  mockCanPerformAction: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  requireRole: mockRequireRole,
  getCompanyPlan: mockGetCompanyPlan,
  parseBody: async (
    req: Request,
    schema: { parse: (d: unknown) => unknown }
  ) => {
    try {
      const body = await req.json();
      return { data: schema.parse(body) };
    } catch {
      return {
        error: NextResponse.json(
          { error: "Validation failed" },
          { status: 400 }
        ),
      };
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
  },
  scenarios: {
    id: "id",
    companyId: "companyId",
    name: "name",
    type: "type",
    createdAt: "createdAt",
  },
  financialAuditLogs: {},
}));

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(), logAuditBatch: vi.fn() }));

vi.mock("@/lib/feature-gate", () => ({
  canPerformAction: mockCanPerformAction,
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

import { GET, POST } from "../route";

function jsonRequest(url: string, method: string, body?: unknown): Request {
  const opts: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return new Request(url, opts);
}

describe("GET /api/scenarios", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({ returning: mockReturning });
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const req = jsonRequest("http://localhost/api/scenarios", "GET");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns scenarios list", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "viewer",
    });

    const mockScenarios = [
      { id: "scen-1", companyId: "comp-1", name: "Base Case", type: "base" },
      { id: "scen-2", companyId: "comp-1", name: "Best Case", type: "best" },
    ];
    mockOrderBy.mockResolvedValue(mockScenarios);

    const req = jsonRequest("http://localhost/api/scenarios", "GET");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(2);
    expect(body[0].name).toBe("Base Case");
    expect(body[1].name).toBe("Best Case");
    expect(mockSelect).toHaveBeenCalled();
  });
});

describe("POST /api/scenarios", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({ returning: mockReturning });
  });

  it("creates scenario (201)", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "editor",
    });
    mockRequireRole.mockReturnValue(null);
    mockGetCompanyPlan.mockResolvedValue("starter");
    // Feature gate check: current scenarios count query
    mockWhere.mockResolvedValueOnce([{ id: "scen-1" }]);
    mockCanPerformAction.mockReturnValue({ allowed: true });

    const createdScenario = {
      id: "scen-new",
      companyId: "comp-1",
      name: "Worst Case",
      type: "worst",
      isDefault: false,
      description: null,
    };
    mockReturning.mockResolvedValue([createdScenario]);

    const req = jsonRequest("http://localhost/api/scenarios", "POST", {
      name: "Worst Case",
      type: "worst",
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.id).toBe("scen-new");
    expect(body.name).toBe("Worst Case");
    expect(body.type).toBe("worst");
    expect(mockInsert).toHaveBeenCalled();
    expect(mockReturning).toHaveBeenCalled();
  });

  it("returns 403 for viewer", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "viewer",
    });
    mockRequireRole.mockReturnValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );

    const req = jsonRequest("http://localhost/api/scenarios", "POST", {
      name: "Should Not Create",
      type: "custom",
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("Forbidden");
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
