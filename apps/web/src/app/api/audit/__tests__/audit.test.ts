import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireCompanyAccess, mockRequireRole } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockRequireRole: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  requireRole: mockRequireRole,
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));

const { mockSelect, mockFrom, mockWhere, mockOrderBy, mockLimit } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockOrderBy: vi.fn(),
  mockLimit: vi.fn(),
}));

vi.mock("@burnless/db", () => ({
  db: { select: mockSelect },
  financialAuditLogs: {
    companyId: "companyId",
    entityType: "entityType",
    entityId: "entityId",
    createdAt: "createdAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn((...args: unknown[]) => args),
  desc: vi.fn(),
  lt: vi.fn(),
}));

import { GET } from "../route";

describe("GET /api/audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "u1",
      companyId: "c1",
      role: "admin",
    });
    mockRequireRole.mockReturnValue(null);

    // DB chain: select().from().where().orderBy().limit()
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockOrderBy.mockReturnValue({ limit: mockLimit });
  });

  it("returns audit logs with default pagination", async () => {
    const mockLogs = [
      { id: "1", entityType: "transaction", action: "create", createdAt: new Date("2026-03-20") },
    ];
    mockLimit.mockResolvedValue(mockLogs);

    const req = new Request("http://localhost:3000/api/audit");
    const res = await GET(req);
    const body = await res.json();

    expect(body.data).toHaveLength(1);
    expect(body.nextCursor).toBeNull();
    // Default limit is 50, so we query for 51
    expect(mockLimit).toHaveBeenCalledWith(51);
  });

  it("returns nextCursor when more results exist", async () => {
    const date = new Date("2026-03-15");
    // Return limit+1 items to trigger pagination
    const mockLogs = Array.from({ length: 6 }, (_, i) => ({
      id: `${i}`,
      entityType: "transaction",
      createdAt: new Date(date.getTime() - i * 86400000),
    }));
    mockLimit.mockResolvedValue(mockLogs);

    const req = new Request("http://localhost:3000/api/audit?limit=5");
    const res = await GET(req);
    const body = await res.json();

    expect(body.data).toHaveLength(5);
    expect(body.nextCursor).toBeDefined();
  });

  it("caps limit at 200", async () => {
    mockLimit.mockResolvedValue([]);

    const req = new Request("http://localhost:3000/api/audit?limit=999");
    const res = await GET(req);

    expect(mockLimit).toHaveBeenCalledWith(201); // 200 + 1 for pagination check
  });

  it("rejects non-admin users with 403", async () => {
    mockRequireRole.mockReturnValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );

    const req = new Request("http://localhost:3000/api/audit");
    const res = await GET(req);

    expect(res.status).toBe(403);
  });

  it("returns auth error when not authenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const req = new Request("http://localhost:3000/api/audit");
    const res = await GET(req);

    expect(res.status).toBe(401);
  });
});
