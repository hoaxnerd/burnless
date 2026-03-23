import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireCompanyAccess } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
}));

const { mockSelect, mockFrom, mockWhere, mockThen } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockThen: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  errorResponse: (msg: string, status: number) =>
    NextResponse.json({ error: msg }, { status }),
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock("@burnless/db", () => ({
  db: { select: mockSelect },
  scenarios: { id: "id", companyId: "companyId", name: "name" },
  forecastLines: { scenarioId: "scenarioId" },
  financialAccounts: { companyId: "companyId" },
  revenueStreams: { scenarioId: "scenarioId" },
  headcountPlans: { scenarioId: "scenarioId" },
  fundingRounds: { companyId: "companyId" },
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn() }));

vi.mock("@burnless/engine", () => ({
  computeAllForecastLines: vi.fn().mockReturnValue([]),
  aggregateByAccount: vi.fn().mockReturnValue(new Map()),
  computeTotalRevenue: vi.fn().mockReturnValue(new Map()),
  computeAllHeadcountCosts: vi
    .fn()
    .mockReturnValue({ totalCost: new Map(), headcount: new Map() }),
  compareScenarios: vi.fn().mockReturnValue({
    baseScenario: { id: "base-1", name: "Base" },
    compareScenario: { id: "comp-1", name: "Compare" },
    revenue: {
      baseValues: [],
      compareValues: [],
      deltaAbsolute: [],
      deltaPercent: [],
    },
    expenses: {
      baseValues: [],
      compareValues: [],
      deltaAbsolute: [],
      deltaPercent: [],
    },
    netIncome: {
      baseValues: [],
      compareValues: [],
      deltaAbsolute: [],
      deltaPercent: [],
    },
    cashPosition: {
      baseValues: [],
      compareValues: [],
      deltaAbsolute: [],
      deltaPercent: [],
    },
    headcount: {
      baseValues: [],
      compareValues: [],
      deltaAbsolute: [],
      deltaPercent: [],
    },
  }),
  addSeries: vi.fn().mockReturnValue(new Map()),
  subtractSeries: vi.fn().mockReturnValue(new Map()),
}));

import { GET } from "../compare/route";

function makeRequest(url: string): Request {
  return new Request(url, { method: "GET" });
}

describe("GET /api/scenarios/compare", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ then: mockThen });
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const req = makeRequest(
      "http://localhost/api/scenarios/compare?baseId=b1&compareId=c1"
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 400 when baseId is missing", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "viewer",
    });

    const req = makeRequest(
      "http://localhost/api/scenarios/compare?compareId=c1"
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("baseId and compareId required");
  });

  it("returns 400 when compareId is missing", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "viewer",
    });

    const req = makeRequest(
      "http://localhost/api/scenarios/compare?baseId=b1"
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("baseId and compareId required");
  });

  it("returns 404 when base scenario not found", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "viewer",
    });

    // Base scenario lookup returns empty (not found), compare returns a hit
    mockWhere
      .mockReturnValueOnce({ then: vi.fn().mockResolvedValue(undefined) })
      .mockReturnValueOnce({
        then: vi.fn().mockResolvedValue({ id: "c1", name: "Compare", companyId: "comp-1" }),
      });

    const req = makeRequest(
      "http://localhost/api/scenarios/compare?baseId=b1&compareId=c1"
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Scenario not found");
  });

  it("returns 404 when compare scenario not found", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "viewer",
    });

    // Base scenario found, compare not found
    mockWhere
      .mockReturnValueOnce({
        then: vi.fn().mockResolvedValue({ id: "b1", name: "Base", companyId: "comp-1" }),
      })
      .mockReturnValueOnce({
        then: vi.fn().mockResolvedValue(undefined),
      });

    const req = makeRequest(
      "http://localhost/api/scenarios/compare?baseId=b1&compareId=c1"
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Scenario not found");
  });

  it("returns comparison data on success with correct shape", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "viewer",
    });

    // Both scenarios found
    mockWhere
      .mockReturnValueOnce({
        then: vi.fn().mockResolvedValue({ id: "b1", name: "Base", companyId: "comp-1" }),
      })
      .mockReturnValueOnce({
        then: vi.fn().mockResolvedValue({ id: "c1", name: "Compare", companyId: "comp-1" }),
      })
      // buildScenarioData queries (5 per scenario = 10 total)
      .mockResolvedValue([]);

    const req = makeRequest(
      "http://localhost/api/scenarios/compare?baseId=b1&compareId=c1"
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.baseScenario).toEqual({ id: "base-1", name: "Base" });
    expect(body.compareScenario).toEqual({ id: "comp-1", name: "Compare" });
    expect(body.lines).toHaveLength(5);
    expect(body.lines.map((l: { name: string }) => l.name)).toEqual([
      "Revenue",
      "Expenses",
      "Net Income",
      "Cash Position",
      "Headcount",
    ]);

    for (const line of body.lines) {
      expect(line).toHaveProperty("baseValues");
      expect(line).toHaveProperty("compareValues");
      expect(line).toHaveProperty("deltaAbsolute");
      expect(line).toHaveProperty("deltaPercent");
    }
  });
});
