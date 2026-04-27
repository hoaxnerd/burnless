import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireCompanyAccess } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));

const { mockGetDefaultScenario, mockGetCompany } = vi.hoisted(() => ({
  mockGetDefaultScenario: vi.fn(),
  mockGetCompany: vi.fn().mockResolvedValue({ currency: "USD", locale: "en-US" }),
}));
vi.mock("@/lib/data", () => ({
  getDefaultScenario: mockGetDefaultScenario,
  getCompany: mockGetCompany,
}));

const { mockComputeDashboardData } = vi.hoisted(() => ({
  mockComputeDashboardData: vi.fn(),
}));
vi.mock("@/lib/compute-dashboard", () => ({
  computeDashboardData: mockComputeDashboardData,
}));

const { mockGenerateAlerts } = vi.hoisted(() => ({
  mockGenerateAlerts: vi.fn(),
}));
vi.mock("@/lib/alerts", () => ({
  generateAlerts: mockGenerateAlerts,
}));

import { GET } from "../route";

describe("GET /api/alerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "u1",
      companyId: "c1",
      role: "owner",
    });
    mockGetCompany.mockResolvedValue({ currency: "USD", locale: "en-US" });
  });

  it("returns empty alerts when no scenario exists", async () => {
    mockGetDefaultScenario.mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/alerts");
    const res = await GET(req);
    const body = await res.json();

    expect(body.alerts).toEqual([]);
  });

  it("returns empty alerts when dashboard has no data", async () => {
    mockGetDefaultScenario.mockResolvedValue({ id: "s1" });
    mockComputeDashboardData.mockResolvedValue({ hasData: false });

    const req = new Request("http://localhost:3000/api/alerts");
    const res = await GET(req);
    const body = await res.json();

    expect(body.alerts).toEqual([]);
  });

  it("returns alerts when data is available", async () => {
    mockGetDefaultScenario.mockResolvedValue({ id: "s1" });
    mockComputeDashboardData.mockResolvedValue({
      hasData: true,
      metrics: {
        cashRunwayMonths: 3,
        netBurnRate: 50000,
        mrr: 10000,
        cashPosition: 150000,
      },
      currentMonth: "2026-03",
    });
    mockGenerateAlerts.mockReturnValue([
      { type: "low_runway", severity: "critical", message: "Cash runway is 3 months" },
    ]);

    const req = new Request("http://localhost:3000/api/alerts");
    const res = await GET(req);
    const body = await res.json();

    expect(body.alerts).toHaveLength(1);
    expect(body.alerts[0].type).toBe("low_runway");
    expect(mockGenerateAlerts).toHaveBeenCalledWith(
      expect.objectContaining({
        cashRunway: 3,
        netBurnRate: 50000,
      })
    );
  });

  it("returns empty alerts on computation error (graceful degradation)", async () => {
    mockGetDefaultScenario.mockResolvedValue({ id: "s1" });
    mockComputeDashboardData.mockRejectedValue(new Error("Engine crash"));

    const req = new Request("http://localhost:3000/api/alerts");
    const res = await GET(req);
    const body = await res.json();

    expect(body.alerts).toEqual([]);
  });

  it("returns auth error when not authenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const req = new Request("http://localhost:3000/api/alerts");
    const res = await GET(req);

    expect(res.status).toBe(401);
  });
});
