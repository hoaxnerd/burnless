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
  mockLimit,
  mockUpdate,
  mockSet,
  mockReturning,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockLimit: vi.fn(),
  mockUpdate: vi.fn(),
  mockSet: vi.fn(),
  mockReturning: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  requireRole: mockRequireRole,
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
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock("@burnless/db", () => ({
  db: {
    select: mockSelect,
    update: mockUpdate,
  },
  companies: {
    id: "id",
    name: "name",
    stage: "stage",
    businessModel: "businessModel",
    industry: "industry",
    currency: "currency",
    locale: "locale",
    timezone: "timezone",
    region: "region",
    fiscalYearEnd: "fiscalYearEnd",
  },
  // Stub hasFinancialData — company.test.ts doesn't test financial-data gating;
  // always return false so PATCH tests aren't blocked by the confirm gate.
  hasFinancialData: vi.fn().mockResolvedValue(false),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

import { GET, PATCH } from "../route";

function jsonRequest(url: string, method: string, body?: unknown): Request {
  const opts: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return new Request(url, opts);
}

describe("GET /api/company", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockWhere });
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const req = jsonRequest("http://localhost/api/company", "GET");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns company profile", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "owner",
    });

    const company = {
      id: "comp-1",
      name: "Acme Corp",
      stage: "seed",
      businessModel: "saas",
      industry: "fintech",
      currency: "USD",
      locale: "en",
      timezone: "America/New_York",
      region: "us-east",
      fiscalYearEnd: 12,
    };
    mockLimit.mockResolvedValue([company]);

    const req = jsonRequest("http://localhost/api/company", "GET");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.id).toBe("comp-1");
    expect(body.name).toBe("Acme Corp");
    expect(mockSelect).toHaveBeenCalled();
  });

  it("returns 404 when company not found", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "owner",
    });
    mockLimit.mockResolvedValue([]);

    const req = jsonRequest("http://localhost/api/company", "GET");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Company not found");
  });
});

describe("PATCH /api/company", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit, returning: mockReturning });
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockWhere });

    // PATCH now SELECTs the existing company before updating (for currency-change
    // detection). Return a stub company so the handler doesn't return 404.
    mockLimit.mockResolvedValue([{
      id: "comp-1",
      name: "Existing Co",
      currency: "USD",
    }]);
  });

  it("updates company fields", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "admin",
    });
    mockRequireRole.mockReturnValue(null);

    const updatedCompany = {
      id: "comp-1",
      name: "New Name",
      stage: "series_a",
      currency: "EUR",
    };
    mockReturning.mockResolvedValue([updatedCompany]);

    const req = jsonRequest("http://localhost/api/company", "PATCH", {
      name: "New Name",
      stage: "series_a",
      currency: "EUR",
    });
    const res = await PATCH(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.name).toBe("New Name");
    expect(body.stage).toBe("series_a");
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("returns 403 for non-admin", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "editor",
    });
    mockRequireRole.mockReturnValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );

    const req = jsonRequest("http://localhost/api/company", "PATCH", {
      name: "Should Not Update",
    });
    const res = await PATCH(req);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("Forbidden");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("updates businessModel, industry, and fiscalYearEnd", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "admin",
    });
    mockRequireRole.mockReturnValue(null);

    const updatedCompany = {
      id: "comp-1",
      name: "Acme Corp",
      businessModel: "marketplace",
      industry: "Fintech",
      fiscalYearEnd: 3,
    };
    mockReturning.mockResolvedValue([updatedCompany]);

    const req = jsonRequest("http://localhost/api/company", "PATCH", {
      businessModel: "marketplace",
      industry: "Fintech",
      fiscalYearEnd: 3,
    });
    const res = await PATCH(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.businessModel).toBe("marketplace");
    expect(body.industry).toBe("Fintech");
    expect(body.fiscalYearEnd).toBe(3);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("rejects invalid fiscalYearEnd values", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "admin",
    });
    mockRequireRole.mockReturnValue(null);

    const req = jsonRequest("http://localhost/api/company", "PATCH", {
      fiscalYearEnd: 13,
    });
    const res = await PATCH(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
  });

  it("rejects invalid businessModel values", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "admin",
    });
    mockRequireRole.mockReturnValue(null);

    const req = jsonRequest("http://localhost/api/company", "PATCH", {
      businessModel: "invalid_model",
    });
    const res = await PATCH(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
  });

  it("allows setting industry to null", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "admin",
    });
    mockRequireRole.mockReturnValue(null);

    const updatedCompany = {
      id: "comp-1",
      name: "Acme Corp",
      industry: null,
    };
    mockReturning.mockResolvedValue([updatedCompany]);

    const req = jsonRequest("http://localhost/api/company", "PATCH", {
      industry: null,
    });
    const res = await PATCH(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.industry).toBeNull();
  });

  it("returns 400 for invalid data", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "admin",
    });
    mockRequireRole.mockReturnValue(null);

    const req = jsonRequest("http://localhost/api/company", "PATCH", {
      name: "",
    });
    const res = await PATCH(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
  });
});
