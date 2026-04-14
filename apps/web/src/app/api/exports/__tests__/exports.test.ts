import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireCompanyAccess, mockGetCompanyPlan } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockGetCompanyPlan: vi.fn(),
}));

const { mockCanPerformAction, mockGetPlanLimits } = vi.hoisted(() => ({
  mockCanPerformAction: vi.fn(),
  mockGetPlanLimits: vi.fn(),
}));

const {
  mockSelect,
  mockFrom,
  mockWhere,
  mockInsert,
  mockValues,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockInsert: vi.fn(),
  mockValues: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  getCompanyPlan: mockGetCompanyPlan,
  errorResponse: (msg: string, status: number) =>
    NextResponse.json({ error: msg }, { status }),
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock("@/lib/feature-gate", () => ({
  canPerformAction: mockCanPerformAction,
}));

vi.mock("@burnless/ai", () => ({
  getPlanLimits: mockGetPlanLimits,
}));

vi.mock("@burnless/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
  },
  exportLogs: { companyId: "companyId", userId: "userId", exportType: "exportType", format: "format", createdAt: "createdAt" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  gte: vi.fn(),
  count: vi.fn(),
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

const authCtx = {
  userId: "user-1",
  companyId: "company-1",
  role: "admin",
};

describe("Exports API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCompanyAccess.mockResolvedValue(authCtx);
    mockGetCompanyPlan.mockResolvedValue("growth");
    mockGetPlanLimits.mockReturnValue({ maxExports: 50 });
    mockCanPerformAction.mockReturnValue({ allowed: true });

    // DB chain for select (count query)
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockResolvedValue([{ cnt: 3 }]);

    // DB chain for insert
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockResolvedValue(undefined);
  });

  // ── GET ──────────────────────────────────────────────────────────────────

  describe("GET /api/exports", () => {
    it("returns usage stats with remaining allowance", async () => {
      const res = await GET();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.used).toBe(3);
      expect(data.limit).toBe(50);
      expect(data.remaining).toBe(47);
    });

    it("returns -1 for unlimited plans", async () => {
      mockGetPlanLimits.mockReturnValue({ maxExports: Infinity });

      const res = await GET();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.limit).toBe(-1);
      expect(data.remaining).toBe(-1);
    });

    it("returns 0 remaining when at limit", async () => {
      mockWhere.mockResolvedValue([{ cnt: 50 }]);

      const res = await GET();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.used).toBe(50);
      expect(data.remaining).toBe(0);
    });

    it("rejects unauthenticated requests", async () => {
      mockRequireCompanyAccess.mockResolvedValue({
        error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      });

      const res = await GET();
      expect(res.status).toBe(401);
    });
  });

  // ── POST ─────────────────────────────────────────────────────────────────

  describe("POST /api/exports", () => {
    it("records export and returns updated count", async () => {
      const res = await POST(
        jsonRequest("/api/exports", "POST", {
          exportType: "financial-report",
          format: "pdf",
        })
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.used).toBe(4); // 3 + 1
      expect(data.remaining).toBe(46);
      expect(mockInsert).toHaveBeenCalled();
    });

    it("rejects when export limit exceeded (403)", async () => {
      mockCanPerformAction.mockReturnValue({
        allowed: false,
        reason: "Monthly export limit reached",
      });

      const res = await POST(
        jsonRequest("/api/exports", "POST", {
          exportType: "financial-report",
          format: "csv",
        })
      );
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("limit");
    });

    it("rejects invalid format", async () => {
      const res = await POST(
        jsonRequest("/api/exports", "POST", {
          exportType: "report",
          format: "xlsx", // not a valid enum value
        })
      );
      expect(res.status).toBe(400);
    });

    it("rejects missing exportType", async () => {
      const res = await POST(
        jsonRequest("/api/exports", "POST", {
          format: "pdf",
        })
      );
      expect(res.status).toBe(400);
    });

    it("rejects empty body", async () => {
      const res = await POST(
        jsonRequest("/api/exports", "POST", {})
      );
      expect(res.status).toBe(400);
    });

    it("rejects unauthenticated requests", async () => {
      mockRequireCompanyAccess.mockResolvedValue({
        error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      });

      const res = await POST(
        jsonRequest("/api/exports", "POST", {
          exportType: "report",
          format: "pdf",
        })
      );
      expect(res.status).toBe(401);
    });

    it("handles CSV exports", async () => {
      const res = await POST(
        jsonRequest("/api/exports", "POST", {
          exportType: "transactions",
          format: "csv",
        })
      );
      expect(res.status).toBe(200);
      expect(mockInsert).toHaveBeenCalled();
    });
  });
});
