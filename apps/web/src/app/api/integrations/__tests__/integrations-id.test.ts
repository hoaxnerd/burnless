import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

const ORIG_ENV = process.env;

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
  integrations: { id: "id", companyId: "companyId", type: "type", status: "status", metadata: "metadata", lastSyncAt: "lastSyncAt" },
  // DELETE also clears the encrypted stored credentials (C1.5).
  deleteIntegrationCredentials: vi.fn(),
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
  afterEach(() => {
    process.env = ORIG_ENV;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Capability gate is REAL: integrations is only ON in the cloud edition.
    // Run the functional tests in cloud mode so the gate passes; the gate's
    // both-mode behavior is covered explicitly below.
    process.env = { ...ORIG_ENV, BURNLESS_DEPLOYMENT: "cloud" };
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
  afterEach(() => {
    process.env = ORIG_ENV;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...ORIG_ENV, BURNLESS_DEPLOYMENT: "cloud" };
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

// ── Capability gate (REAL requireCapability) — both editions ─────────────────
// integrations is OFF on self_host (default) and ON on cloud. The [id] mutation
// handlers must be server-authoritative: a self_host user with admin role + auth
// still gets a 403 CAPABILITY_DISABLED, because UI hiding is not the gate.

describe("integrations/[id] — capability gate (both editions)", () => {
  afterEach(() => {
    process.env = ORIG_ENV;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCompanyAccess.mockResolvedValue(authCtx);
    mockRequireRole.mockReturnValue(null);
    mockReturning.mockResolvedValue([{ id: "int-1" }]);
  });

  describe("self_host (BURNLESS_DEPLOYMENT unset)", () => {
    beforeEach(() => {
      process.env = { ...ORIG_ENV };
      delete process.env.BURNLESS_DEPLOYMENT;
    });

    it("PATCH returns 403 CAPABILITY_DISABLED for integrations", async () => {
      const res = await PATCH(
        makeRequest("/api/integrations/int-1", "PATCH", { status: "active" }),
        makeParams("int-1"),
      );
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe("CAPABILITY_DISABLED");
      expect(data.capability).toBe("integrations");
    });

    it("DELETE returns 403 CAPABILITY_DISABLED for integrations", async () => {
      const res = await DELETE(
        makeRequest("/api/integrations/int-1", "DELETE"),
        makeParams("int-1"),
      );
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe("CAPABILITY_DISABLED");
      expect(data.capability).toBe("integrations");
    });
  });

  describe("cloud (BURNLESS_DEPLOYMENT=cloud)", () => {
    beforeEach(() => {
      process.env = { ...ORIG_ENV, BURNLESS_DEPLOYMENT: "cloud" };
    });

    it("PATCH passes the capability gate (not a 403)", async () => {
      const res = await PATCH(
        makeRequest("/api/integrations/int-1", "PATCH", { status: "active" }),
        makeParams("int-1"),
      );
      expect(res.status).not.toBe(403);
    });

    it("DELETE passes the capability gate (not a 403)", async () => {
      const res = await DELETE(
        makeRequest("/api/integrations/int-1", "DELETE"),
        makeParams("int-1"),
      );
      expect(res.status).not.toBe(403);
    });
  });
});
