import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockRequireCompanyAccess, mockRequireRole, mockRequirePlanFeature } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockRequireRole: vi.fn(),
  mockRequirePlanFeature: vi.fn(),
}));

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  requireRole: mockRequireRole,
  requirePlanFeature: mockRequirePlanFeature,
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

/**
 * DB mock: uses a sequential results array.
 * Each db chain (select→from→…→terminal) consumes the next result.
 */
let dbResults: unknown[];
let dbResultIdx: number;

function nextDbResult() {
  return dbResults[dbResultIdx++] ?? [];
}

vi.mock("@burnless/db", () => {
  const makeChain = (): Record<string, (...args: unknown[]) => unknown> => {
    const chain: Record<string, (...args: unknown[]) => unknown> = {};
    const self = () => chain;
    chain.from = self;
    chain.where = self;
    chain.limit = self;
    chain.orderBy = self;
    chain.set = self;
    chain.values = self;
    chain.returning = self;
    chain.then = (...args: unknown[]) => (args[0] as (v: unknown) => unknown)(nextDbResult());
    return chain;
  };

  return {
    db: {
      select: () => makeChain(),
      insert: () => makeChain(),
      update: () => makeChain(),
      delete: () => makeChain(),
    },
    integrations: {
      id: "id",
      companyId: "companyId",
      type: "type",
      status: "status",
      lastSyncAt: "lastSyncAt",
      metadata: "metadata",
    },
  };
});

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));

import { GET, POST } from "../route";
import { PATCH, DELETE } from "../[id]/route";

function makeRequest(url: string, options?: RequestInit): Request {
  return new Request(url, options);
}

function jsonRequest(url: string, method: string, body?: unknown): Request {
  const opts: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return new Request(url, opts);
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ── Tests: GET /api/integrations ─────────────────────────────────────────────

describe("GET /api/integrations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockReturnValue(null);
    mockRequirePlanFeature.mockResolvedValue(null);
    dbResults = [];
    dbResultIdx = 0;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const res = await GET(makeRequest("http://localhost/api/integrations"));
    expect(res.status).toBe(401);
  });

  it("returns integrations list for authenticated user", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1", companyId: "company-1", role: "viewer",
    });

    dbResults = [[
      { id: "int-1", companyId: "company-1", type: "quickbooks", status: "active" },
      { id: "int-2", companyId: "company-1", type: "stripe", status: "disconnected" },
    ]];

    const res = await GET(makeRequest("http://localhost/api/integrations"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(2);
    expect(body[0].type).toBe("quickbooks");
    expect(body[1].type).toBe("stripe");
  });

  it("returns empty array when no integrations exist", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1", companyId: "company-1", role: "viewer",
    });
    dbResults = [[]];

    const res = await GET(makeRequest("http://localhost/api/integrations"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual([]);
  });
});

// ── Tests: POST /api/integrations ────────────────────────────────────────────

describe("POST /api/integrations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockReturnValue(null);
    mockRequirePlanFeature.mockResolvedValue(null);
    dbResults = [];
    dbResultIdx = 0;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const res = await POST(jsonRequest("http://localhost/api/integrations", "POST", {
      type: "quickbooks",
    }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin role", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1", companyId: "company-1", role: "viewer",
    });
    mockRequireRole.mockReturnValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );

    const res = await POST(jsonRequest("http://localhost/api/integrations", "POST", {
      type: "quickbooks",
    }));
    expect(res.status).toBe(403);
  });

  it("returns 403 when plan does not include custom integrations", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1", companyId: "company-1", role: "admin",
    });
    mockRequirePlanFeature.mockResolvedValue(
      NextResponse.json(
        { error: "Custom integrations require a Team plan.", upgradeTarget: "team", code: "PLAN_LIMIT_REACHED" },
        { status: 403 }
      )
    );

    const res = await POST(jsonRequest("http://localhost/api/integrations", "POST", {
      type: "quickbooks",
    }));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.code).toBe("PLAN_LIMIT_REACHED");
    expect(body.upgradeTarget).toBe("team");
  });

  it("returns 400 for invalid integration type", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1", companyId: "company-1", role: "admin",
    });

    const res = await POST(jsonRequest("http://localhost/api/integrations", "POST", {
      type: "invalid_type",
    }));
    expect(res.status).toBe(400);
  });

  it("creates new integration (201)", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1", companyId: "company-1", role: "admin",
    });

    const created = {
      id: "int-new", companyId: "company-1", type: "quickbooks",
      status: "active", lastSyncAt: new Date().toISOString(), metadata: null,
    };
    dbResults = [
      [],          // existing check - not found
      [created],   // insert returning
    ];

    const res = await POST(jsonRequest("http://localhost/api/integrations", "POST", {
      type: "quickbooks",
    }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.type).toBe("quickbooks");
    expect(body.status).toBe("active");
  });

  it("reconnects existing disconnected integration (upsert)", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1", companyId: "company-1", role: "admin",
    });

    const updated = {
      id: "int-existing", companyId: "company-1", type: "xero",
      status: "active", lastSyncAt: new Date().toISOString(), metadata: null,
    };
    dbResults = [
      [{ id: "int-existing", companyId: "company-1", type: "xero", status: "disconnected" }], // existing found
      [updated], // update returning
    ];

    const res = await POST(jsonRequest("http://localhost/api/integrations", "POST", {
      type: "xero",
    }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("active");
    expect(body.id).toBe("int-existing");
  });

  it("passes metadata when creating integration", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1", companyId: "company-1", role: "admin",
    });

    const created = {
      id: "int-new", companyId: "company-1", type: "plaid",
      status: "active", metadata: { accessToken: "access-sandbox-123" },
    };
    dbResults = [[], [created]];

    const res = await POST(jsonRequest("http://localhost/api/integrations", "POST", {
      type: "plaid",
      metadata: { accessToken: "access-sandbox-123" },
    }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.metadata.accessToken).toBe("access-sandbox-123");
  });
});

// ── Tests: PATCH /api/integrations/[id] ──────────────────────────────────────

describe("PATCH /api/integrations/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockReturnValue(null);
    mockRequirePlanFeature.mockResolvedValue(null);
    dbResults = [];
    dbResultIdx = 0;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const req = jsonRequest("http://localhost/api/integrations/int-1", "PATCH", {
      status: "disconnected",
    });
    const res = await PATCH(req, makeParams("int-1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin role", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1", companyId: "company-1", role: "editor",
    });
    mockRequireRole.mockReturnValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );

    const req = jsonRequest("http://localhost/api/integrations/int-1", "PATCH", {
      status: "disconnected",
    });
    const res = await PATCH(req, makeParams("int-1"));
    expect(res.status).toBe(403);
  });

  it("updates integration status", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1", companyId: "company-1", role: "admin",
    });

    dbResults = [[{
      id: "int-1", companyId: "company-1", type: "quickbooks", status: "disconnected",
    }]];

    const req = jsonRequest("http://localhost/api/integrations/int-1", "PATCH", {
      status: "disconnected",
    });
    const res = await PATCH(req, makeParams("int-1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("disconnected");
  });

  it("returns 404 when integration not found", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1", companyId: "company-1", role: "admin",
    });
    dbResults = [[]]; // update returns empty

    const req = jsonRequest("http://localhost/api/integrations/nonexistent", "PATCH", {
      status: "active",
    });
    const res = await PATCH(req, makeParams("nonexistent"));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Integration not found");
  });

  it("returns 400 for invalid status value", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1", companyId: "company-1", role: "admin",
    });

    const req = jsonRequest("http://localhost/api/integrations/int-1", "PATCH", {
      status: "invalid_status",
    });
    const res = await PATCH(req, makeParams("int-1"));
    expect(res.status).toBe(400);
  });
});

// ── Tests: DELETE /api/integrations/[id] ─────────────────────────────────────

describe("DELETE /api/integrations/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockReturnValue(null);
    mockRequirePlanFeature.mockResolvedValue(null);
    dbResults = [];
    dbResultIdx = 0;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const req = makeRequest("http://localhost/api/integrations/int-1", { method: "DELETE" });
    const res = await DELETE(req, makeParams("int-1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin role", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1", companyId: "company-1", role: "viewer",
    });
    mockRequireRole.mockReturnValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );

    const req = makeRequest("http://localhost/api/integrations/int-1", { method: "DELETE" });
    const res = await DELETE(req, makeParams("int-1"));
    expect(res.status).toBe(403);
  });

  it("deletes integration successfully", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1", companyId: "company-1", role: "admin",
    });
    dbResults = [[{ id: "int-1", companyId: "company-1", type: "quickbooks" }]];

    const req = makeRequest("http://localhost/api/integrations/int-1", { method: "DELETE" });
    const res = await DELETE(req, makeParams("int-1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("returns 404 when integration not found for delete", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1", companyId: "company-1", role: "admin",
    });
    dbResults = [[]];

    const req = makeRequest("http://localhost/api/integrations/nonexistent", { method: "DELETE" });
    const res = await DELETE(req, makeParams("nonexistent"));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Integration not found");
  });
});
