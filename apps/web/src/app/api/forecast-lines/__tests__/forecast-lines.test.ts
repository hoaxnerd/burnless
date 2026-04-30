/**
 * Tests for GET /api/forecast-lines and POST /api/forecast-lines.
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
  forecastLines: { companyId: "companyId", id: "id" },
  resolveEntities: mockResolveEntities,
  scenarioInsert: mockScenarioInsert,
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn(), lt: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/data-mutation-tracker", () => ({ trackDataMutation: vi.fn() }));
vi.mock("@/lib/pagination", () => ({
  parsePaginationParams: () => ({ limit: 50, cursor: null }),
  paginatedResponse: (rows: unknown[], limit: number) => ({
    data: rows.slice(0, limit),
    hasMore: rows.length > limit,
  }),
}));
vi.mock("@/lib/scenario-middleware", () => ({ getActiveScenario: mockGetActiveScenario }));

import { GET, POST } from "../route";

function jsonRequest(url: string, method: string, body?: unknown): Request {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return new Request(url, opts);
}

const CTX = { userId: "u1", companyId: "c1", role: "admin" };

const sampleLine = {
  id: "fl-1",
  companyId: "c1",
  accountId: "a1",
  method: "fixed",
  parameters: { amount: 5000 },
  startDate: new Date("2026-01-01"),
  endDate: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireCompanyAccess.mockResolvedValue(CTX);
  mockRequireRole.mockReturnValue(null);
  mockGetActiveScenario.mockReturnValue(null);
  mockSelect.mockReturnValue({ from: mockFrom });
  mockFrom.mockReturnValue({ where: mockWhere });
});

describe("GET /api/forecast-lines", () => {
  it("returns 401 when not authenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const res = await GET(jsonRequest("http://localhost/api/forecast-lines", "GET"));
    expect(res.status).toBe(401);
  });

  it("returns resolved forecast lines (no scenario)", async () => {
    mockWhere.mockResolvedValue([sampleLine]);
    mockResolveEntities.mockResolvedValue([{ ...sampleLine, _override: null }]);
    const res = await GET(jsonRequest("http://localhost/api/forecast-lines", "GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(mockResolveEntities).toHaveBeenCalledWith("forecast_line", [sampleLine], null);
  });

  it("passes scenarioId from header to resolveEntities", async () => {
    mockGetActiveScenario.mockReturnValue("scen-1");
    mockWhere.mockResolvedValue([]);
    mockResolveEntities.mockResolvedValue([]);
    await GET(jsonRequest("http://localhost/api/forecast-lines", "GET"));
    expect(mockResolveEntities).toHaveBeenCalledWith("forecast_line", [], "scen-1");
  });
});

describe("POST /api/forecast-lines", () => {
  it("returns 401 when not authenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const res = await POST(jsonRequest("http://localhost/api/forecast-lines", "POST", {
      accountId: "a1", startDate: "2026-01-01",
    }));
    expect(res.status).toBe(401);
  });

  it("creates a forecast line via scenarioInsert", async () => {
    mockScenarioInsert.mockResolvedValue(sampleLine);
    const res = await POST(jsonRequest("http://localhost/api/forecast-lines", "POST", {
      accountId: "a1", startDate: "2026-01-01",
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("fl-1");
    expect(mockScenarioInsert).toHaveBeenCalledWith(
      "forecast_line", expect.anything(),
      expect.objectContaining({ accountId: "a1", companyId: "c1" }),
      null,
    );
  });

  it("persists Phase-1 fields (vendor/notes/frequency/isOneTime/isRecurring/departmentId)", async () => {
    mockScenarioInsert.mockResolvedValue({ ...sampleLine, vendor: "AWS", notes: "Q1 hosting", frequency: "annual", isOneTime: true, isRecurring: false, departmentId: "dept-1" });
    const res = await POST(jsonRequest("http://localhost/api/forecast-lines", "POST", {
      accountId: "a1",
      method: "fixed",
      parameters: { amount: 5000 },
      startDate: "2026-01-01",
      endDate: null,
      vendor: "AWS",
      notes: "Q1 hosting",
      frequency: "annual",
      isOneTime: true,
      isRecurring: false,
      departmentId: "dept-1",
    }));
    expect(res.status).toBe(201);
    expect(mockScenarioInsert).toHaveBeenCalledWith(
      "forecast_line",
      expect.anything(),
      expect.objectContaining({
        accountId: "a1",
        companyId: "c1",
        vendor: "AWS",
        notes: "Q1 hosting",
        frequency: "annual",
        isOneTime: true,
        isRecurring: false,
        departmentId: "dept-1",
      }),
      null,
    );
  });

  it("returns 403 when user lacks editor role", async () => {
    mockRequireRole.mockReturnValue(NextResponse.json({ error: "Insufficient permissions" }, { status: 403 }));
    const res = await POST(jsonRequest("http://localhost/api/forecast-lines", "POST", {
      accountId: "a1", startDate: "2026-01-01",
    }));
    expect(res.status).toBe(403);
  });
});
