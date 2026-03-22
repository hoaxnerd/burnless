import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireCompanyAccess } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  withErrorHandler: (fn: Function) => fn,
}));

const {
  mockSelect, mockFrom, mockWhere, mockOrderBy, mockLimit,
  mockUpdate, mockSet, mockUpdateWhere,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockOrderBy: vi.fn(),
  mockLimit: vi.fn(),
  mockUpdate: vi.fn(),
  mockSet: vi.fn(),
  mockUpdateWhere: vi.fn(),
}));

vi.mock("@burnless/db", () => ({
  db: {
    select: mockSelect,
    update: mockUpdate,
  },
  weeklyDigests: {
    id: "id",
    companyId: "companyId",
    weekStart: "weekStart",
    dismissedAt: "dismissedAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
  isNull: vi.fn(),
}));

import { GET, POST } from "../route";

describe("/api/digest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "u1",
      companyId: "c1",
      role: "owner",
    });

    // DB chain: select().from().where().orderBy().limit()
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockOrderBy.mockReturnValue({ limit: mockLimit });

    // Update chain: update().set().where()
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockResolvedValue([]);
  });

  describe("GET", () => {
    it("returns latest non-dismissed digest", async () => {
      const digest = {
        id: "d1",
        companyId: "c1",
        weekStart: "2026-03-16",
        narrative: "Your startup is doing great",
        dismissedAt: null,
      };
      mockLimit.mockResolvedValue([digest]);

      const req = new Request("http://localhost:3000/api/digest");
      const res = await GET(req);
      const body = await res.json();

      expect(body.digest).toBeDefined();
      expect(body.digest.id).toBe("d1");
    });

    it("returns null when no active digest exists", async () => {
      mockLimit.mockResolvedValue([]);

      const req = new Request("http://localhost:3000/api/digest");
      const res = await GET(req);
      const body = await res.json();

      expect(body.digest).toBeNull();
    });

    it("returns auth error when not authenticated", async () => {
      mockRequireCompanyAccess.mockResolvedValue({
        error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      });

      const req = new Request("http://localhost:3000/api/digest");
      const res = await GET(req);

      expect(res.status).toBe(401);
    });
  });

  describe("POST", () => {
    it("dismisses a digest successfully", async () => {
      const req = new Request("http://localhost:3000/api/digest", {
        method: "POST",
        body: JSON.stringify({ action: "dismiss", digestId: "d1" }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await POST(req);
      const body = await res.json();

      expect(body.ok).toBe(true);
      expect(mockUpdate).toHaveBeenCalled();
    });

    it("returns 400 for invalid action", async () => {
      const req = new Request("http://localhost:3000/api/digest", {
        method: "POST",
        body: JSON.stringify({ action: "invalid", digestId: "d1" }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toBe("Invalid action");
    });

    it("returns 400 when dismiss action has no digestId", async () => {
      const req = new Request("http://localhost:3000/api/digest", {
        method: "POST",
        body: JSON.stringify({ action: "dismiss" }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toBe("Invalid action");
    });
  });
});
