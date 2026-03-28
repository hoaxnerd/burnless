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
  mockOrderBy,
  mockLimit,
  mockInsert,
  mockValues,
  mockReturning,
  mockInnerJoin,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockOrderBy: vi.fn(),
  mockLimit: vi.fn(),
  mockInsert: vi.fn(),
  mockValues: vi.fn(),
  mockReturning: vi.fn(),
  mockInnerJoin: vi.fn(),
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
    select: mockSelect,
    insert: mockInsert,
  },
  inviteCodes: { id: "id", code: "code", createdAt: "createdAt" },
  inviteCodeRedemptions: {
    id: "id",
    userId: "userId",
    inviteCodeId: "inviteCodeId",
    redeemedAt: "redeemedAt",
  },
  users: { id: "id", name: "name", email: "email" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  desc: vi.fn(),
  inArray: vi.fn(),
}));

import { GET, POST } from "../route";

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

describe("Admin Invite Codes API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCompanyAccess.mockResolvedValue(adminCtx);
    mockRequireRole.mockReturnValue(null);

    // Default DB chain for select
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ orderBy: mockOrderBy, innerJoin: mockInnerJoin, where: mockWhere });
    mockOrderBy.mockResolvedValue([]);
    mockInnerJoin.mockReturnValue({ where: mockWhere });
    // mockWhere must support both `.limit()` chaining and direct `await`
    mockWhere.mockImplementation(() => {
      const chain = { limit: mockLimit, orderBy: mockOrderBy, then: (resolve: (v: unknown[]) => void) => resolve([]) };
      return chain;
    });
    mockLimit.mockResolvedValue([]);

    // Default DB chain for insert
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({ returning: mockReturning });
  });

  // ── GET ──────────────────────────────────────────────────────────────────

  describe("GET /api/admin/invite-codes", () => {
    it("returns list of invite codes with redemptions", async () => {
      const codes = [
        { id: "code-1", code: "ABC123", type: "single_use", isActive: true, createdAt: new Date() },
      ];
      mockOrderBy.mockResolvedValue(codes);

      // Batch redemptions query: select({...}).from().innerJoin().where(inArray(...))
      const redemptions = [
        { id: "r1", inviteCodeId: "code-1", userId: "user-2", userName: "Alice", userEmail: "alice@test.com", redeemedAt: new Date() },
      ];
      // Second select call (for redemptions batch) uses: select -> from -> innerJoin -> where
      let selectCallCount = 0;
      mockSelect.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          // First call: codes query
          return { from: mockFrom };
        }
        // Second call: batch redemptions query
        return {
          from: () => ({
            innerJoin: () => ({
              where: vi.fn().mockResolvedValue(redemptions),
            }),
          }),
        };
      });

      const res = await GET(jsonRequest("/api/admin/invite-codes", "GET"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveLength(1);
      expect(data[0].code).toBe("ABC123");
      expect(data[0].redemptions).toHaveLength(1);
      expect(data[0].redemptions[0].userName).toBe("Alice");
    });

    it("returns empty array when no codes exist", async () => {
      mockOrderBy.mockResolvedValue([]);

      const res = await GET(jsonRequest("/api/admin/invite-codes", "GET"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual([]);
    });

    it("rejects non-admin users", async () => {
      mockRequireRole.mockReturnValue(
        NextResponse.json({ error: "Forbidden" }, { status: 403 })
      );

      const res = await GET(jsonRequest("/api/admin/invite-codes", "GET"));
      expect(res.status).toBe(403);
    });

    it("rejects unauthenticated requests", async () => {
      mockRequireCompanyAccess.mockResolvedValue({
        error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      });

      const res = await GET(jsonRequest("/api/admin/invite-codes", "GET"));
      expect(res.status).toBe(401);
    });
  });

  // ── POST ─────────────────────────────────────────────────────────────────

  describe("POST /api/admin/invite-codes", () => {
    it("creates invite code with defaults", async () => {
      mockLimit.mockResolvedValue([]); // no duplicate
      const created = {
        id: "code-1",
        code: "GENERATED",
        type: "single_use",
        maxRedemptions: 1,
        freePlatformDays: 30,
        aiCreditsCents: 5000,
      };
      mockReturning.mockResolvedValue([created]);

      const res = await POST(
        jsonRequest("/api/admin/invite-codes", "POST", {})
      );
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.type).toBe("single_use");
    });

    it("creates invite code with custom code", async () => {
      mockLimit.mockResolvedValue([]); // no duplicate
      const created = {
        id: "code-2",
        code: "BETA-2024",
        type: "multi_use",
        maxRedemptions: 50,
      };
      mockReturning.mockResolvedValue([created]);

      const res = await POST(
        jsonRequest("/api/admin/invite-codes", "POST", {
          code: "BETA-2024",
          type: "multi_use",
          maxRedemptions: 50,
        })
      );
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.code).toBe("BETA-2024");
    });

    it("rejects duplicate code (409)", async () => {
      mockLimit.mockResolvedValue([{ id: "existing-1" }]); // duplicate found

      const res = await POST(
        jsonRequest("/api/admin/invite-codes", "POST", {
          code: "DUPLICATE",
        })
      );
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toContain("already exists");
    });

    it("rejects invalid code format", async () => {
      const res = await POST(
        jsonRequest("/api/admin/invite-codes", "POST", {
          code: "invalid code!@#",
        })
      );
      expect(res.status).toBe(400);
    });

    it("rejects non-admin users", async () => {
      mockRequireRole.mockReturnValue(
        NextResponse.json({ error: "Forbidden" }, { status: 403 })
      );

      const res = await POST(
        jsonRequest("/api/admin/invite-codes", "POST", {})
      );
      expect(res.status).toBe(403);
    });

    it("creates code with custom expiration and credits", async () => {
      mockLimit.mockResolvedValue([]); // no duplicate
      const created = {
        id: "code-3",
        code: "PROMO",
        freePlatformDays: 90,
        aiCreditsCents: 10000,
        expiresAt: "2026-12-31T23:59:59.000Z",
      };
      mockReturning.mockResolvedValue([created]);

      const res = await POST(
        jsonRequest("/api/admin/invite-codes", "POST", {
          code: "PROMO",
          freePlatformDays: 90,
          aiCreditsCents: 10000,
          expiresAt: "2026-12-31T23:59:59.000Z",
        })
      );
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.freePlatformDays).toBe(90);
      expect(data.aiCreditsCents).toBe(10000);
    });
  });
});
