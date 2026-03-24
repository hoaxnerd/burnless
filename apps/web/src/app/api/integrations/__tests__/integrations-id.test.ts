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

vi.mock("@burnless/db", () => ({
  db: {
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ returning: mockReturning }),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ returning: mockReturning }),
    }),
  },
  integrations: { id: "id", companyId: "companyId", status: "status", metadata: "metadata", lastSyncAt: "lastSyncAt" },
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn() }));

import { PATCH, DELETE } from "../[id]/route";

function makeParams(id: string) { return { params: Promise.resolve({ id }) }; }
function makeRequest(url: string, method: string, body?: unknown): Request {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  return new Request(`http://localhost${url}`, opts);
}

const authCtx = { userId: "user-1", companyId: "company-1", role: "admin" };

describe("integrations/[id] PATCH", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCompanyAccess.mockResolvedValue(authCtx);
    mockRequireRole.mockReturnValue(null);
  });

  it("returns 401 when not authorized", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const res = await PATCH(
      makeRequest("/api/integrations/int-1", "PATCH", { status: "active" }),
      makeParams("int-1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when not admin", async () => {
    mockRequireRole.mockReturnValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const res = await PATCH(
      makeRequest("/api/integrations/int-1", "PATCH", { status: "active" }),
      makeParams("int-1"),
    );
    expect(res.status).toBe(403);
  });

  it("updates integration status", async () => {
    mockReturning.mockResolvedValue([{ id: "int-1", status: "active" }]);
    const res = await PATCH(
      makeRequest("/api/integrations/int-1", "PATCH", { status: "active" }),
      makeParams("int-1"),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("active");
  });

  it("updates integration metadata", async () => {
    mockReturning.mockResolvedValue([{ id: "int-1", metadata: { key: "val" } }]);
    const res = await PATCH(
      makeRequest("/api/integrations/int-1", "PATCH", { metadata: { key: "val" } }),
      makeParams("int-1"),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.metadata).toEqual({ key: "val" });
  });

  it("returns 404 when integration not found", async () => {
    mockReturning.mockResolvedValue([]);
    const res = await PATCH(
      makeRequest("/api/integrations/int-999", "PATCH", { status: "disconnected" }),
      makeParams("int-999"),
    );
    expect(res.status).toBe(404);
  });

  it("rejects invalid status value", async () => {
    const res = await PATCH(
      makeRequest("/api/integrations/int-1", "PATCH", { status: "invalid" }),
      makeParams("int-1"),
    );
    expect(res.status).toBe(400);
  });
});

describe("integrations/[id] DELETE", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCompanyAccess.mockResolvedValue(authCtx);
    mockRequireRole.mockReturnValue(null);
  });

  it("returns 401 when not authorized", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const res = await DELETE(
      makeRequest("/api/integrations/int-1", "DELETE"),
      makeParams("int-1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when not admin", async () => {
    mockRequireRole.mockReturnValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const res = await DELETE(
      makeRequest("/api/integrations/int-1", "DELETE"),
      makeParams("int-1"),
    );
    expect(res.status).toBe(403);
  });

  it("deletes integration successfully", async () => {
    mockReturning.mockResolvedValue([{ id: "int-1" }]);
    const res = await DELETE(
      makeRequest("/api/integrations/int-1", "DELETE"),
      makeParams("int-1"),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("returns 404 when integration not found", async () => {
    mockReturning.mockResolvedValue([]);
    const res = await DELETE(
      makeRequest("/api/integrations/int-999", "DELETE"),
      makeParams("int-999"),
    );
    expect(res.status).toBe(404);
  });
});
