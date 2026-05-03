/**
 * Tests for GET/POST /api/headcount/[id]/equity-grants.
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
  mockListResolvedEquityGrants,
  mockCreateEquityGrant,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockListResolvedEquityGrants: vi.fn(),
  mockCreateEquityGrant: vi.fn(),
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
  listResolvedEquityGrants: mockListResolvedEquityGrants,
  createEquityGrant: mockCreateEquityGrant,
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/data-mutation-tracker", () => ({ trackDataMutation: vi.fn() }));
vi.mock("@/lib/scenario-middleware", () => ({ getActiveScenario: mockGetActiveScenario }));
vi.mock("@burnless/types", () => ({
  createEquityGrantSchema: {
    parse: (d: unknown) => {
      const v = d as {
        grantDate: string;
        shares: number;
        strikePrice?: number | null;
        grantType?: string;
        parameters?: Record<string, unknown>;
      };
      if (typeof v.shares !== "number" || v.shares <= 0) throw new Error("invalid");
      return {
        grantDate: new Date(v.grantDate),
        shares: v.shares,
        strikePrice: v.strikePrice ?? undefined,
        grantType: v.grantType ?? "iso",
        parameters: v.parameters,
      };
    },
  },
}));

import { GET, POST } from "../[id]/equity-grants/route";

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

describe("GET /api/headcount/[id]/equity-grants", () => {
  it("returns 401 when not authorized", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const res = await GET(jsonRequest("http://localhost/api/headcount/hc-1/equity-grants", "GET"), makeParams("hc-1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when headcount not found", async () => {
    mockWhere.mockResolvedValue([]);
    const res = await GET(jsonRequest("http://localhost/api/headcount/hc-1/equity-grants", "GET"), makeParams("hc-1"));
    expect(res.status).toBe(404);
  });

  it("returns resolved equity grants when parent exists", async () => {
    mockWhere.mockResolvedValue([{ id: "hc-1" }]);
    mockListResolvedEquityGrants.mockResolvedValue([
      { id: "eg-1", headcountId: "hc-1", shares: "10000.0000", _override: null },
    ]);
    const res = await GET(jsonRequest("http://localhost/api/headcount/hc-1/equity-grants", "GET"), makeParams("hc-1"));
    expect(res.status).toBe(200);
    expect(mockListResolvedEquityGrants).toHaveBeenCalledWith("comp-1", "hc-1", null);
  });
});

describe("POST /api/headcount/[id]/equity-grants", () => {
  it("returns 403 for viewer", async () => {
    mockRequireRole.mockReturnValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    const res = await POST(
      jsonRequest("http://localhost/api/headcount/hc-1/equity-grants", "POST", {
        grantDate: "2026-01-01", shares: 10000, grantType: "iso",
      }),
      makeParams("hc-1"),
    );
    expect(res.status).toBe(403);
    expect(mockCreateEquityGrant).not.toHaveBeenCalled();
  });

  it("returns 404 when headcount not found", async () => {
    mockWhere.mockResolvedValue([]);
    const res = await POST(
      jsonRequest("http://localhost/api/headcount/hc-1/equity-grants", "POST", {
        grantDate: "2026-01-01", shares: 10000, grantType: "iso",
      }),
      makeParams("hc-1"),
    );
    expect(res.status).toBe(404);
    expect(mockCreateEquityGrant).not.toHaveBeenCalled();
  });

  it("creates equity grant via createEquityGrant (201) and stringifies decimals", async () => {
    mockWhere.mockResolvedValue([{ id: "hc-1" }]);
    mockCreateEquityGrant.mockResolvedValue({ id: "eg-new", headcountId: "hc-1", shares: "10000.0000" });
    const res = await POST(
      jsonRequest("http://localhost/api/headcount/hc-1/equity-grants", "POST", {
        grantDate: "2026-01-01",
        shares: 10000,
        strikePrice: 1.5,
        grantType: "iso",
        parameters: { vestingSchedule: [] },
      }),
      makeParams("hc-1"),
    );
    expect(res.status).toBe(201);
    expect(mockCreateEquityGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "comp-1",
        headcountId: "hc-1",
        shares: "10000.0000",
        strikePrice: "1.5000",
        grantType: "iso",
      }),
      null,
    );
  });

  it("returns 400 on invalid body", async () => {
    mockWhere.mockResolvedValue([{ id: "hc-1" }]);
    const res = await POST(
      jsonRequest("http://localhost/api/headcount/hc-1/equity-grants", "POST", {
        grantDate: "2026-01-01", shares: 0, grantType: "iso",
      }),
      makeParams("hc-1"),
    );
    expect(res.status).toBe(400);
  });
});
