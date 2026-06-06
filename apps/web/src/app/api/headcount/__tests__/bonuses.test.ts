/**
 * Tests for GET/POST /api/headcount/[id]/bonuses.
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
  mockListResolvedBonuses,
  mockCreateBonus,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockListResolvedBonuses: vi.fn(),
  mockCreateBonus: vi.fn(),
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
  listResolvedBonuses: mockListResolvedBonuses,
  createBonus: mockCreateBonus,
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/data-mutation-tracker", () => ({ trackDataMutation: vi.fn() }));
vi.mock("@/lib/scenario-middleware", () => ({ getActiveScenario: mockGetActiveScenario }));
vi.mock("@burnless/types", () => ({
  createBonusSchema: {
    parse: (d: unknown) => {
      const v = d as { payoutMonth: string; amount: number; type?: string; notes?: string | null };
      if (typeof v.amount !== "number" || v.amount < 0) throw new Error("invalid");
      return {
        payoutMonth: new Date(v.payoutMonth),
        amount: v.amount,
        type: v.type ?? "performance",
        notes: v.notes,
      };
    },
  },
}));

import { GET, POST } from "../[id]/bonuses/route";

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

describe("GET /api/headcount/[id]/bonuses", () => {
  it("returns 401 when not authorized", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const res = await GET(jsonRequest("http://localhost/api/headcount/hc-1/bonuses", "GET"), makeParams("hc-1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when headcount not found", async () => {
    mockWhere.mockResolvedValue([]);
    const res = await GET(jsonRequest("http://localhost/api/headcount/hc-1/bonuses", "GET"), makeParams("hc-1"));
    expect(res.status).toBe(404);
  });

  it("returns resolved bonuses when parent exists", async () => {
    mockWhere.mockResolvedValue([{ id: "hc-1" }]);
    mockListResolvedBonuses.mockResolvedValue([
      { id: "b-1", headcountId: "hc-1", amount: "5000.00", _override: null },
    ]);
    const res = await GET(jsonRequest("http://localhost/api/headcount/hc-1/bonuses", "GET"), makeParams("hc-1"));
    expect(res.status).toBe(200);
    expect(mockListResolvedBonuses).toHaveBeenCalledWith("comp-1", "hc-1", null);
  });
});

describe("POST /api/headcount/[id]/bonuses", () => {
  it("returns 403 for viewer", async () => {
    mockRequireRole.mockReturnValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    const res = await POST(
      jsonRequest("http://localhost/api/headcount/hc-1/bonuses", "POST", {
        payoutMonth: "2026-12-01", amount: 5000, type: "performance",
      }),
      makeParams("hc-1"),
    );
    expect(res.status).toBe(403);
    expect(mockCreateBonus).not.toHaveBeenCalled();
  });

  it("returns 404 when headcount not found", async () => {
    mockWhere.mockResolvedValue([]);
    const res = await POST(
      jsonRequest("http://localhost/api/headcount/hc-1/bonuses", "POST", {
        payoutMonth: "2026-12-01", amount: 5000, type: "performance",
      }),
      makeParams("hc-1"),
    );
    expect(res.status).toBe(404);
    expect(mockCreateBonus).not.toHaveBeenCalled();
  });

  it("creates bonus via createBonus (201)", async () => {
    mockWhere.mockResolvedValue([{ id: "hc-1" }]);
    mockCreateBonus.mockResolvedValue({ id: "b-new", headcountId: "hc-1", amount: "5000.00" });
    const res = await POST(
      jsonRequest("http://localhost/api/headcount/hc-1/bonuses", "POST", {
        payoutMonth: "2026-12-01", amount: 5000, type: "performance", notes: "Q4",
      }),
      makeParams("hc-1"),
    );
    expect(res.status).toBe(201);
    expect(mockCreateBonus).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "comp-1",
        headcountId: "hc-1",
        amount: "5000.00",
        type: "performance",
        notes: "Q4",
      }),
      null,
      "comp-1",
    );
  });

  it("returns 400 on invalid body", async () => {
    mockWhere.mockResolvedValue([{ id: "hc-1" }]);
    const res = await POST(
      jsonRequest("http://localhost/api/headcount/hc-1/bonuses", "POST", {
        payoutMonth: "2026-12-01", amount: -1, type: "performance",
      }),
      makeParams("hc-1"),
    );
    expect(res.status).toBe(400);
  });
});
