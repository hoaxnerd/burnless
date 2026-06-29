/**
 * Tests for GET /api/competitors and POST /api/competitors.
 * Highest-value assertion: domain gate returns 403 DOMAIN_DISABLED.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireCompanyAccess, mockRequireWrite } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockRequireWrite: vi.fn(),
}));

const { mockRequireDomainEnabled } = vi.hoisted(() => ({
  mockRequireDomainEnabled: vi.fn(),
}));

const { mockListCompetitors, mockCreateCompetitor, mockCreateSource } = vi.hoisted(() => ({
  mockListCompetitors: vi.fn(),
  mockCreateCompetitor: vi.fn(),
  mockCreateSource: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  requireCompanyWrite: mockRequireWrite,
  parseBody: async (req: Request, schema: { parse: (d: unknown) => unknown }) => {
    try {
      return { data: schema.parse(await req.json()) };
    } catch {
      return { error: NextResponse.json({ error: "Validation failed" }, { status: 400 }) };
    }
  },
  errorResponse: (msg: string, status: number) => NextResponse.json({ error: msg }, { status }),
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock("@/lib/domain-gating", () => ({
  requireDomainEnabled: mockRequireDomainEnabled,
}));

vi.mock("@burnless/db", () => ({
  listCompetitors: mockListCompetitors,
  createCompetitor: mockCreateCompetitor,
  createSource: mockCreateSource,
}));

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

import { GET, POST } from "../route";

const validCtx = { userId: "user-1", companyId: "company-1", role: "editor" } as const;

function makeRequest(url: string, options?: RequestInit): Request {
  return new Request(url, options);
}

describe("GET /api/competitors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const res = await GET(makeRequest("http://localhost/api/competitors"));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 DOMAIN_DISABLED when competitor domain is off", async () => {
    mockRequireCompanyAccess.mockResolvedValue(validCtx);
    mockRequireDomainEnabled.mockResolvedValue(
      NextResponse.json(
        { error: "This domain is not available on this deployment", code: "DOMAIN_DISABLED", domainId: "competitor" },
        { status: 403 },
      ),
    );

    const res = await GET(makeRequest("http://localhost/api/competitors"));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.code).toBe("DOMAIN_DISABLED");
    expect(mockListCompetitors).not.toHaveBeenCalled();
  });

  it("returns competitors list when domain is enabled", async () => {
    mockRequireCompanyAccess.mockResolvedValue(validCtx);
    mockRequireDomainEnabled.mockResolvedValue(null);
    mockListCompetitors.mockResolvedValue([
      { id: "c-1", name: "Acme", url: "https://acme.com", status: "active" },
    ]);

    const res = await GET(makeRequest("http://localhost/api/competitors"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.competitors).toHaveLength(1);
    expect(body.competitors[0].name).toBe("Acme");
    expect(mockListCompetitors).toHaveBeenCalledWith("company-1");
  });
});

describe("POST /api/competitors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 DOMAIN_DISABLED when competitor domain is off", async () => {
    mockRequireWrite.mockResolvedValue(validCtx);
    mockRequireDomainEnabled.mockResolvedValue(
      NextResponse.json(
        { error: "This domain is not available on this deployment", code: "DOMAIN_DISABLED", domainId: "competitor" },
        { status: 403 },
      ),
    );

    const res = await POST(
      makeRequest("http://localhost/api/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Rival", url: "https://rival.com" }),
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.code).toBe("DOMAIN_DISABLED");
    expect(mockCreateCompetitor).not.toHaveBeenCalled();
  });

  it("creates competitor and returns 201", async () => {
    mockRequireWrite.mockResolvedValue(validCtx);
    mockRequireDomainEnabled.mockResolvedValue(null);
    mockCreateCompetitor.mockResolvedValue({
      id: "c-new",
      companyId: "company-1",
      name: "Rival",
      url: "https://rival.com",
      status: "active",
    });

    const res = await POST(
      makeRequest("http://localhost/api/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Rival", url: "https://rival.com" }),
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.competitor.id).toBe("c-new");
    expect(mockCreateCompetitor).toHaveBeenCalledWith({
      companyId: "company-1",
      name: "Rival",
      url: "https://rival.com",
    });
    expect(mockCreateSource).not.toHaveBeenCalled();
  });

  it("creates competitor with sources when provided", async () => {
    mockRequireWrite.mockResolvedValue(validCtx);
    mockRequireDomainEnabled.mockResolvedValue(null);
    mockCreateCompetitor.mockResolvedValue({
      id: "c-new",
      companyId: "company-1",
      name: "Rival",
      url: "https://rival.com",
      status: "active",
    });
    mockCreateSource.mockResolvedValue({ id: "src-1" });

    const res = await POST(
      makeRequest("http://localhost/api/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Rival",
          url: "https://rival.com",
          sources: [{ type: "pricing", url: "https://rival.com/pricing" }],
        }),
      }),
    );

    expect(res.status).toBe(201);
    expect(mockCreateSource).toHaveBeenCalledWith({
      companyId: "company-1",
      competitorId: "c-new",
      type: "pricing",
      url: "https://rival.com/pricing",
      config: undefined,
    });
  });

  it("returns 400 for invalid body (missing url)", async () => {
    mockRequireWrite.mockResolvedValue(validCtx);
    mockRequireDomainEnabled.mockResolvedValue(null);

    const res = await POST(
      makeRequest("http://localhost/api/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Rival" }),
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeTruthy();
    expect(mockCreateCompetitor).not.toHaveBeenCalled();
  });
});
