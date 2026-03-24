import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireCompanyAccess, mockRequireRole } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockRequireRole: vi.fn().mockReturnValue(null),
}));

const mockReturning = vi.hoisted(() => vi.fn());

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

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/data-mutation-tracker", () => ({ trackDataMutation: vi.fn() }));

vi.mock("@burnless/db", () => ({
  db: {
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: mockReturning }) }) }),
    delete: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: mockReturning }) }),
  },
  fundingRounds: { id: "id", companyId: "companyId" },
}));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn() }));
vi.mock("@burnless/types", () => ({ updateFundingRoundSchema: { parse: (d: unknown) => d } }));

import { PATCH, DELETE } from "../[id]/route";

function makeParams(id: string) { return { params: Promise.resolve({ id }) }; }
function makeRequest(url: string, opts?: RequestInit) { return new Request(url, opts); }

describe("funding-rounds/[id] PATCH", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockReturnValue(null);
  });

  it("returns 401 when not authorized", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const res = await PATCH(
      makeRequest("http://localhost/api/funding-rounds/fr-1", {
        method: "PATCH",
        body: JSON.stringify({ name: "Series A" }),
      }),
      makeParams("fr-1"),
    );

    expect(res.status).toBe(401);
  });

  it("returns 403 for viewer role", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      companyId: "c-1",
      userId: "u-1",
      role: "viewer",
    });
    mockRequireRole.mockReturnValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );

    const res = await PATCH(
      makeRequest("http://localhost/api/funding-rounds/fr-1", {
        method: "PATCH",
        body: JSON.stringify({ name: "Series A" }),
      }),
      makeParams("fr-1"),
    );

    expect(res.status).toBe(403);
  });

  it("returns 404 when not found", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      companyId: "c-1",
      userId: "u-1",
      role: "editor",
    });
    mockReturning.mockResolvedValue([]);

    const res = await PATCH(
      makeRequest("http://localhost/api/funding-rounds/fr-1", {
        method: "PATCH",
        body: JSON.stringify({ name: "Series A" }),
      }),
      makeParams("fr-1"),
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Funding round not found");
  });

  it("updates and returns row on success", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      companyId: "c-1",
      userId: "u-1",
      role: "editor",
    });
    mockReturning.mockResolvedValue([{ id: "fr-1", name: "Series A", companyId: "c-1" }]);

    const res = await PATCH(
      makeRequest("http://localhost/api/funding-rounds/fr-1", {
        method: "PATCH",
        body: JSON.stringify({ name: "Series A" }),
      }),
      makeParams("fr-1"),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("fr-1");
  });
});

describe("funding-rounds/[id] DELETE", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockReturnValue(null);
  });

  it("returns 401 when not authorized", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const res = await DELETE(
      makeRequest("http://localhost/api/funding-rounds/fr-1", { method: "DELETE" }),
      makeParams("fr-1"),
    );

    expect(res.status).toBe(401);
  });

  it("returns 403 for editor role (requires admin)", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      companyId: "c-1",
      userId: "u-1",
      role: "editor",
    });
    mockRequireRole.mockReturnValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );

    const res = await DELETE(
      makeRequest("http://localhost/api/funding-rounds/fr-1", { method: "DELETE" }),
      makeParams("fr-1"),
    );

    expect(res.status).toBe(403);
  });

  it("returns 404 when not found", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      companyId: "c-1",
      userId: "u-1",
      role: "admin",
    });
    mockReturning.mockResolvedValue([]);

    const res = await DELETE(
      makeRequest("http://localhost/api/funding-rounds/fr-1", { method: "DELETE" }),
      makeParams("fr-1"),
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Funding round not found");
  });

  it("deletes and returns success", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      companyId: "c-1",
      userId: "u-1",
      role: "admin",
    });
    mockReturning.mockResolvedValue([{ id: "fr-1" }]);

    const res = await DELETE(
      makeRequest("http://localhost/api/funding-rounds/fr-1", { method: "DELETE" }),
      makeParams("fr-1"),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
  });
});
