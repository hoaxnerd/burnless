/**
 * Tests for GET/POST /api/headcount/[id]/salary-changes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireCompanyAccess, mockRequireRole } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockRequireRole: vi.fn().mockReturnValue(null),
}));

const {
  mockSelect,
  mockFrom,
  mockWhere,
  mockListResolvedSalaryChanges,
  mockCreateSalaryChange,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockListResolvedSalaryChanges: vi.fn(),
  mockCreateSalaryChange: vi.fn(),
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
  headcountPlans: { id: "id", companyId: "companyId" },
  listResolvedSalaryChanges: mockListResolvedSalaryChanges,
  createSalaryChange: mockCreateSalaryChange,
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/data-mutation-tracker", () => ({ trackDataMutation: vi.fn() }));
vi.mock("@/lib/scenario-middleware", () => ({ getActiveScenario: mockGetActiveScenario }));
vi.mock("@burnless/types", () => ({
  createSalaryChangeSchema: {
    parse: (d: unknown) => {
      const v = d as { effectiveDate: string; newSalary: number; reason?: string | null };
      if (typeof v.newSalary !== "number" || v.newSalary < 0) throw new Error("invalid");
      return { ...v, effectiveDate: new Date(v.effectiveDate) };
    },
  },
}));

import { GET, POST } from "../[id]/salary-changes/route";

function makeParams(id: string) { return { params: Promise.resolve({ id }) }; }
function jsonRequest(url: string, method: string, body?: unknown): Request {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return new Request(url, opts);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireCompanyAccess.mockResolvedValue({ companyId: "comp-1", userId: "user-1", role: "editor" });
  mockRequireRole.mockReturnValue(null);
  mockGetActiveScenario.mockReturnValue(null);
  mockSelect.mockReturnValue({ from: mockFrom });
  mockFrom.mockReturnValue({ where: mockWhere });
});

describe("GET /api/headcount/[id]/salary-changes", () => {
  it("returns 401 when not authorized", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const res = await GET(jsonRequest("http://localhost/api/headcount/hc-1/salary-changes", "GET"), makeParams("hc-1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when headcount not found", async () => {
    mockWhere.mockResolvedValue([]);
    const res = await GET(jsonRequest("http://localhost/api/headcount/hc-1/salary-changes", "GET"), makeParams("hc-1"));
    expect(res.status).toBe(404);
  });

  it("returns resolved salary changes when parent exists", async () => {
    mockWhere.mockResolvedValue([{ id: "hc-1" }]);
    mockListResolvedSalaryChanges.mockResolvedValue([
      { id: "sc-1", headcountId: "hc-1", newSalary: "120000.00", _override: null },
    ]);
    const res = await GET(jsonRequest("http://localhost/api/headcount/hc-1/salary-changes", "GET"), makeParams("hc-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(mockListResolvedSalaryChanges).toHaveBeenCalledWith("comp-1", "hc-1", null);
  });
});

describe("POST /api/headcount/[id]/salary-changes", () => {
  it("returns 403 for viewer", async () => {
    mockRequireRole.mockReturnValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    const res = await POST(
      jsonRequest("http://localhost/api/headcount/hc-1/salary-changes", "POST", {
        effectiveDate: "2026-06-01", newSalary: 120000,
      }),
      makeParams("hc-1"),
    );
    expect(res.status).toBe(403);
    expect(mockCreateSalaryChange).not.toHaveBeenCalled();
  });

  it("returns 404 when headcount not found", async () => {
    mockWhere.mockResolvedValue([]);
    const res = await POST(
      jsonRequest("http://localhost/api/headcount/hc-1/salary-changes", "POST", {
        effectiveDate: "2026-06-01", newSalary: 120000,
      }),
      makeParams("hc-1"),
    );
    expect(res.status).toBe(404);
    expect(mockCreateSalaryChange).not.toHaveBeenCalled();
  });

  it("creates salary change via createSalaryChange (201)", async () => {
    mockWhere.mockResolvedValue([{ id: "hc-1" }]);
    mockCreateSalaryChange.mockResolvedValue({
      id: "sc-new", headcountId: "hc-1", newSalary: "120000.00",
    });
    const res = await POST(
      jsonRequest("http://localhost/api/headcount/hc-1/salary-changes", "POST", {
        effectiveDate: "2026-06-01", newSalary: 120000, reason: "promotion",
      }),
      makeParams("hc-1"),
    );
    expect(res.status).toBe(201);
    expect(mockCreateSalaryChange).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "comp-1",
        headcountId: "hc-1",
        newSalary: "120000.00",
        reason: "promotion",
      }),
      null,
      "comp-1",
    );
  });

  it("returns 400 on invalid body", async () => {
    mockWhere.mockResolvedValue([{ id: "hc-1" }]);
    const res = await POST(
      jsonRequest("http://localhost/api/headcount/hc-1/salary-changes", "POST", {
        effectiveDate: "2026-06-01", newSalary: -1,
      }),
      makeParams("hc-1"),
    );
    expect(res.status).toBe(400);
  });
});
