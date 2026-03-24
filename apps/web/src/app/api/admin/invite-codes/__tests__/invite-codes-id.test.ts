import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireCompanyAccess, mockRequireRole } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockRequireRole: vi.fn().mockReturnValue(null),
}));

const {
  mockUpdate,
  mockSet,
  mockWhere,
  mockReturning,
} = vi.hoisted(() => ({
  mockUpdate: vi.fn(),
  mockSet: vi.fn(),
  mockWhere: vi.fn(),
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

vi.mock("@/lib/api-rate-limit", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@burnless/db", () => ({
  db: {
    update: mockUpdate,
  },
  inviteCodes: { id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
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
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCompanyAccess.mockResolvedValue(adminCtx);
    mockRequireRole.mockReturnValue(null);

    // Default DB chain for update
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ returning: mockReturning });
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
    it("soft-deletes (deactivates) invite code", async () => {
      mockReturning.mockResolvedValue([{ id: "code-1", isActive: false }]);

      const res = await DELETE(
        jsonRequest("/api/admin/invite-codes/code-1", "DELETE"),
        makeParams("code-1")
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it("returns 404 for non-existent code", async () => {
      mockReturning.mockResolvedValue([]);

      const res = await DELETE(
        jsonRequest("/api/admin/invite-codes/nope", "DELETE"),
        makeParams("nope")
      );
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toContain("not found");
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
