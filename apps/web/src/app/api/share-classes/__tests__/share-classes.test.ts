/**
 * Tests for GET /api/share-classes and POST /api/share-classes.
 * Cap-table structure is base-data-only (NOT scenario-editable): POST with an
 * active scenario returns 409. Mirrors funding-rounds.test.ts vi.hoisted mocks.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireCompanyAccess, mockRequireRole } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockRequireRole: vi.fn().mockReturnValue(null),
}));

const { mockListShareClasses, mockCreateShareClass } = vi.hoisted(() => ({
  mockListShareClasses: vi.fn(),
  mockCreateShareClass: vi.fn(),
}));

const { mockGetActiveScenario } = vi.hoisted(() => ({
  mockGetActiveScenario: vi.fn(),
}));

const { mockRevalidateTag, mockLogAudit, mockTrackDataMutation } = vi.hoisted(() => ({
  mockRevalidateTag: vi.fn(),
  mockLogAudit: vi.fn(),
  mockTrackDataMutation: vi.fn(),
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
  listShareClasses: mockListShareClasses,
  createShareClass: mockCreateShareClass,
}));

vi.mock("next/cache", () => ({ revalidateTag: mockRevalidateTag }));
vi.mock("@/lib/audit", () => ({ logAudit: mockLogAudit }));
vi.mock("@/lib/data-mutation-tracker", () => ({ trackDataMutation: mockTrackDataMutation }));
vi.mock("@/lib/scenario-middleware", () => ({ getActiveScenario: mockGetActiveScenario }));

import { GET, POST } from "../route";

function jsonRequest(url: string, method: string, body?: unknown): Request {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return new Request(url, opts);
}

const VALID_SHARE_CLASS = {
  name: "Common",
  classType: "common" as const,
  totalAuthorized: 10_000_000,
  totalIssued: 8_000_000,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireCompanyAccess.mockResolvedValue({ userId: "user-1", companyId: "comp-1", role: "owner" });
  mockRequireRole.mockReturnValue(null);
  mockGetActiveScenario.mockReturnValue(null);
});

describe("GET /api/share-classes", () => {
  it("returns 401 when unauthenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const res = await GET(jsonRequest("http://localhost/api/share-classes", "GET"));
    expect(res.status).toBe(401);
  });

  it("returns share classes for the company", async () => {
    const rows = [
      { id: "sc-1", name: "Common", classType: "common" },
      { id: "sc-2", name: "Series A Preferred", classType: "preferred" },
    ];
    mockListShareClasses.mockResolvedValue(rows);

    const res = await GET(jsonRequest("http://localhost/api/share-classes", "GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(mockListShareClasses).toHaveBeenCalledWith("comp-1");
  });
});

describe("POST /api/share-classes", () => {
  it("creates a share class (201) with STRING-coerced share counts", async () => {
    const created = { id: "sc-new", ...VALID_SHARE_CLASS, companyId: "comp-1" };
    mockCreateShareClass.mockResolvedValue(created);

    const res = await POST(jsonRequest("http://localhost/api/share-classes", "POST", VALID_SHARE_CLASS));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("sc-new");

    // share counts are numeric(18,0) STRINGS at the DB boundary
    expect(mockCreateShareClass).toHaveBeenCalledWith(
      "comp-1",
      expect.objectContaining({
        name: "Common",
        classType: "common",
        totalAuthorized: "10000000",
        totalIssued: "8000000",
      }),
    );

    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.anything(),
      "share_class",
      "sc-new",
      "create",
      expect.objectContaining({ after: created }),
    );
    expect(mockTrackDataMutation).toHaveBeenCalledWith("comp-1", "funding");
    expect(mockRevalidateTag).toHaveBeenCalledWith("cap-table", { expire: 0 });
  });

  it("returns 403 for viewer role", async () => {
    mockRequireRole.mockReturnValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    const res = await POST(jsonRequest("http://localhost/api/share-classes", "POST", VALID_SHARE_CLASS));
    expect(res.status).toBe(403);
    expect(mockCreateShareClass).not.toHaveBeenCalled();
  });

  it("returns 409 when a scenario is active (base-data-only)", async () => {
    mockGetActiveScenario.mockReturnValue("scn-1");
    const res = await POST(jsonRequest("http://localhost/api/share-classes", "POST", VALID_SHARE_CLASS));
    expect(res.status).toBe(409);
    expect(mockCreateShareClass).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid classType", async () => {
    const invalid = { ...VALID_SHARE_CLASS, classType: "not_a_class" };
    const res = await POST(jsonRequest("http://localhost/api/share-classes", "POST", invalid));
    expect(res.status).toBe(400);
  });
});
