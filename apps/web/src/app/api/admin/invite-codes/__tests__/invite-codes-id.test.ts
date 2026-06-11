import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

const ORIG_ENV = process.env;

const { mockRequireCompanyAccess, mockRequireRole } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockRequireRole: vi.fn().mockReturnValue(null),
}));

const {
  mockUpdate,
  mockSet,
  mockWhere,
  mockReturning,
  mockSelect,
  mockSelectFrom,
  mockSelectWhere,
  mockSelectLimit,
  mockDelete,
  mockDeleteWhere,
} = vi.hoisted(() => ({
  mockUpdate: vi.fn(),
  mockSet: vi.fn(),
  mockWhere: vi.fn(),
  mockReturning: vi.fn(),
  mockSelect: vi.fn(),
  mockSelectFrom: vi.fn(),
  mockSelectWhere: vi.fn(),
  mockSelectLimit: vi.fn(),
  mockDelete: vi.fn(),
  mockDeleteWhere: vi.fn(),
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

vi.mock("@/lib/api-rate-limit", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@burnless/db", () => ({
  db: {
    update: mockUpdate,
    select: mockSelect,
    delete: mockDelete,
  },
  inviteCodes: { id: "id" },
  inviteCodeRedemptions: { inviteCodeId: "inviteCodeId" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    { raw: (s: string) => s }
  ),
}));

import { PATCH, DELETE } from "../[id]/route";

function jsonRequest(url: string, method: string, body?: unknown): Request {
  const opts: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  return new Request(`http://localhost${url}`, opts);
}

const adminCtx = {
  userId: "user-1",
  companyId: "company-1",
  role: "admin",
};

const makeParams = (id: string) => ({ params: Promise.resolve({ id }) });

describe("Admin Invite Codes [id] API", () => {
  afterEach(() => {
    process.env = ORIG_ENV;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Capability gate is REAL: invite-codes is only ON in the cloud edition.
    // Run the functional tests in cloud mode so the gate passes; the gate's
    // both-mode behavior is covered explicitly below.
    process.env = { ...ORIG_ENV, BURNLESS_DEPLOYMENT: "cloud" };
    mockRequireCompanyAccess.mockResolvedValue(adminCtx);
    mockRequireRole.mockReturnValue(null);

    // Default DB chain for update
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ returning: mockReturning });

    // SELECT chain — used by DELETE for the existence check + redemption count.
    // `.where()` is both awaitable (count query) AND chainable to `.limit()`
    // (existence query). Default: code exists, zero redemptions.
    mockSelect.mockReturnValue({ from: mockSelectFrom });
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
    const whereThenable = {
      limit: mockSelectLimit,
      then: (resolve: (v: unknown) => unknown) => resolve([{ count: 0 }]),
    };
    mockSelectWhere.mockReturnValue(whereThenable);
    mockSelectLimit.mockResolvedValue([{ id: "code-1" }]);

    // DELETE chain
    mockDelete.mockReturnValue({ where: mockDeleteWhere });
    mockDeleteWhere.mockResolvedValue(undefined);
  });

  // ── PATCH ────────────────────────────────────────────────────────────────

  describe("PATCH /api/admin/invite-codes/:id", () => {
    it("updates invite code fields", async () => {
      const updated = {
        id: "code-1",
        isActive: false,
        maxRedemptions: 100,
      };
      mockReturning.mockResolvedValue([updated]);

      const res = await PATCH(
        jsonRequest("/api/admin/invite-codes/code-1", "PATCH", {
          isActive: false,
          maxRedemptions: 100,
        }),
        makeParams("code-1")
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.isActive).toBe(false);
      expect(data.maxRedemptions).toBe(100);
    });

    it("returns 404 for non-existent code", async () => {
      mockReturning.mockResolvedValue([]);

      const res = await PATCH(
        jsonRequest("/api/admin/invite-codes/nope", "PATCH", {
          isActive: false,
        }),
        makeParams("nope")
      );
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toContain("not found");
    });

    it("returns 400 when no fields provided", async () => {
      const res = await PATCH(
        jsonRequest("/api/admin/invite-codes/code-1", "PATCH", {}),
        makeParams("code-1")
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("No fields");
    });

    it("rejects non-admin users", async () => {
      mockRequireRole.mockReturnValue(
        NextResponse.json({ error: "Forbidden" }, { status: 403 })
      );

      const res = await PATCH(
        jsonRequest("/api/admin/invite-codes/code-1", "PATCH", {
          isActive: false,
        }),
        makeParams("code-1")
      );
      expect(res.status).toBe(403);
    });

    it("updates expiration date", async () => {
      const updated = {
        id: "code-1",
        expiresAt: "2027-01-01T00:00:00.000Z",
      };
      mockReturning.mockResolvedValue([updated]);

      const res = await PATCH(
        jsonRequest("/api/admin/invite-codes/code-1", "PATCH", {
          expiresAt: "2027-01-01T00:00:00.000Z",
        }),
        makeParams("code-1")
      );
      expect(res.status).toBe(200);
    });

    it("clears expiration by setting null", async () => {
      const updated = { id: "code-1", expiresAt: null };
      mockReturning.mockResolvedValue([updated]);

      const res = await PATCH(
        jsonRequest("/api/admin/invite-codes/code-1", "PATCH", {
          expiresAt: null,
        }),
        makeParams("code-1")
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.expiresAt).toBeNull();
    });

    it("updates note field", async () => {
      const updated = { id: "code-1", note: "VIP partners" };
      mockReturning.mockResolvedValue([updated]);

      const res = await PATCH(
        jsonRequest("/api/admin/invite-codes/code-1", "PATCH", {
          note: "VIP partners",
        }),
        makeParams("code-1")
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.note).toBe("VIP partners");
    });
  });

  // ── DELETE ───────────────────────────────────────────────────────────────

  describe("DELETE /api/admin/invite-codes/:id", () => {
    it("hard-deletes a never-redeemed code (zero redemptions)", async () => {
      mockSelectLimit.mockResolvedValue([{ id: "code-1" }]);
      mockSelectWhere.mockReturnValue({
        limit: mockSelectLimit,
        then: (resolve: (v: unknown) => unknown) => resolve([{ count: 0 }]),
      });

      const res = await DELETE(
        jsonRequest("/api/admin/invite-codes/code-1", "DELETE"),
        makeParams("code-1")
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      // Real hard-delete, not a soft-deactivate update.
      expect(mockDelete).toHaveBeenCalled();
      expect(mockDeleteWhere).toHaveBeenCalled();
    });

    it("returns 409 for a redeemed code and does NOT delete", async () => {
      mockSelectLimit.mockResolvedValue([{ id: "code-1" }]);
      mockSelectWhere.mockReturnValue({
        limit: mockSelectLimit,
        then: (resolve: (v: unknown) => unknown) => resolve([{ count: 3 }]),
      });

      const res = await DELETE(
        jsonRequest("/api/admin/invite-codes/code-1", "DELETE"),
        makeParams("code-1")
      );
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.code).toBe("INVITE_CODE_HAS_REDEMPTIONS");
      expect(mockDelete).not.toHaveBeenCalled();
    });

    it("returns 404 for non-existent code", async () => {
      mockSelectLimit.mockResolvedValue([]);

      const res = await DELETE(
        jsonRequest("/api/admin/invite-codes/nope", "DELETE"),
        makeParams("nope")
      );
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toContain("not found");
      expect(mockDelete).not.toHaveBeenCalled();
    });

    it("rejects non-admin users", async () => {
      mockRequireRole.mockReturnValue(
        NextResponse.json({ error: "Forbidden" }, { status: 403 })
      );

      const res = await DELETE(
        jsonRequest("/api/admin/invite-codes/code-1", "DELETE"),
        makeParams("code-1")
      );
      expect(res.status).toBe(403);
    });

    it("rejects unauthenticated requests", async () => {
      mockRequireCompanyAccess.mockResolvedValue({
        error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      });

      const res = await DELETE(
        jsonRequest("/api/admin/invite-codes/code-1", "DELETE"),
        makeParams("code-1")
      );
      expect(res.status).toBe(401);
    });
  });
});

// ── Capability gate (REAL requireCapability) — both editions ─────────────────
// inviteCodes is OFF on self_host (default) and ON on cloud. The [id] mutation
// handlers must be server-authoritative: a self_host user with admin role + auth
// still gets a 403 CAPABILITY_DISABLED, because UI hiding is not the gate.

describe("Admin Invite Codes [id] API — capability gate (both editions)", () => {
  afterEach(() => {
    process.env = ORIG_ENV;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCompanyAccess.mockResolvedValue(adminCtx);
    mockRequireRole.mockReturnValue(null);

    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ returning: mockReturning });
    mockReturning.mockResolvedValue([{ id: "code-1" }]);

    mockSelect.mockReturnValue({ from: mockSelectFrom });
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
    mockSelectWhere.mockReturnValue({
      limit: mockSelectLimit,
      then: (resolve: (v: unknown) => unknown) => resolve([{ count: 0 }]),
    });
    mockSelectLimit.mockResolvedValue([{ id: "code-1" }]);
    mockDelete.mockReturnValue({ where: mockDeleteWhere });
    mockDeleteWhere.mockResolvedValue(undefined);
  });

  describe("self_host (BURNLESS_DEPLOYMENT unset)", () => {
    beforeEach(() => {
      process.env = { ...ORIG_ENV };
      delete process.env.BURNLESS_DEPLOYMENT;
    });

    it("PATCH returns 403 CAPABILITY_DISABLED for inviteCodes", async () => {
      const res = await PATCH(
        jsonRequest("/api/admin/invite-codes/code-1", "PATCH", {
          isActive: false,
        }),
        makeParams("code-1")
      );
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe("CAPABILITY_DISABLED");
      expect(data.capability).toBe("inviteCodes");
    });

    it("DELETE returns 403 CAPABILITY_DISABLED for inviteCodes", async () => {
      const res = await DELETE(
        jsonRequest("/api/admin/invite-codes/code-1", "DELETE"),
        makeParams("code-1")
      );
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe("CAPABILITY_DISABLED");
      expect(data.capability).toBe("inviteCodes");
    });
  });

  describe("cloud (BURNLESS_DEPLOYMENT=cloud)", () => {
    beforeEach(() => {
      process.env = { ...ORIG_ENV, BURNLESS_DEPLOYMENT: "cloud" };
    });

    it("PATCH passes the capability gate (not a 403)", async () => {
      const res = await PATCH(
        jsonRequest("/api/admin/invite-codes/code-1", "PATCH", {
          isActive: false,
        }),
        makeParams("code-1")
      );
      expect(res.status).not.toBe(403);
    });

    it("DELETE passes the capability gate (not a 403)", async () => {
      const res = await DELETE(
        jsonRequest("/api/admin/invite-codes/code-1", "DELETE"),
        makeParams("code-1")
      );
      expect(res.status).not.toBe(403);
    });
  });
});
