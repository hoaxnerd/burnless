/**
 * Imports list API route tests — BUR-192
 *
 * Tests GET /api/imports handler: auth, pagination, and data shape.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// ── Hoisted mocks ──────────────────────────────────────────────────────────

const { mockRequireCompanyAccess } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
}));

const {
  mockSelect,
  mockFrom,
  mockWhere,
  mockOrderBy,
  mockLimit,
  mockLeftJoin,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockOrderBy: vi.fn(),
  mockLimit: vi.fn(),
  mockLeftJoin: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  withErrorHandler: (fn: Function) => fn,
}));

vi.mock("@burnless/db", () => ({
  db: {
    select: mockSelect,
  },
  importBatches: {
    id: "id",
    companyId: "companyId",
    fileName: "fileName",
    status: "status",
    totalRows: "totalRows",
    importedCount: "importedCount",
    skippedCount: "skippedCount",
    errorCount: "errorCount",
    accountId: "accountId",
    columnMapping: "columnMapping",
    rolledBackAt: "rolledBackAt",
    createdAt: "createdAt",
  },
  financialAccounts: {
    id: "id",
    name: "name",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn((...args: unknown[]) => args),
  desc: vi.fn(),
  lt: vi.fn(),
}));

vi.mock("@/lib/pagination", () => ({
  parsePaginationParams: (req: Request) => {
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
    const cursor = url.searchParams.get("cursor") ?? null;
    return { limit, cursor };
  },
  paginatedResponse: (rows: unknown[], limit: number) => {
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    return {
      data,
      pagination: {
        hasMore,
        nextCursor: hasMore && data.length > 0 ? (data[data.length - 1] as Record<string, unknown>).id : null,
        count: data.length,
      },
    };
  },
}));

function setupDbChains(mockData: unknown[] = []) {
  mockSelect.mockReturnValue({ from: mockFrom });
  mockFrom.mockReturnValue({ leftJoin: mockLeftJoin });
  mockLeftJoin.mockReturnValue({ where: mockWhere });
  mockWhere.mockReturnValue({ orderBy: mockOrderBy });
  mockOrderBy.mockReturnValue({ limit: mockLimit });
  mockLimit.mockResolvedValue(mockData);
}

import { GET } from "../route";

function makeRequest(url = "http://localhost/api/imports"): Request {
  return new Request(url);
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("GET /api/imports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDbChains();
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns empty list with no import history", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "company-1",
      role: "viewer",
    });
    setupDbChains([]);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
    expect(body.pagination.hasMore).toBe(false);
    expect(body.pagination.count).toBe(0);
  });

  it("returns import batches with account names", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "company-1",
      role: "viewer",
    });

    const mockBatches = [
      {
        id: "batch-1",
        fileName: "mercury-export.csv",
        status: "completed",
        totalRows: 100,
        importedCount: 95,
        skippedCount: 5,
        errorCount: 0,
        accountId: "acc-1",
        columnMapping: { date: "Date", amount: "Amount" },
        rolledBackAt: null,
        createdAt: "2026-03-15T10:00:00Z",
        accountName: "Operating Account",
      },
    ];
    setupDbChains(mockBatches);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].fileName).toBe("mercury-export.csv");
    expect(body.data[0].status).toBe("completed");
    expect(body.data[0].accountName).toBe("Operating Account");
    expect(body.data[0].importedCount).toBe(95);
    expect(body.data[0].skippedCount).toBe(5);
  });

  it("respects pagination params", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "company-1",
      role: "viewer",
    });

    // Return limit+1 items to trigger hasMore
    const mockBatches = [
      { id: "batch-1", fileName: "a.csv", status: "completed" },
      { id: "batch-2", fileName: "b.csv", status: "completed" },
      { id: "batch-3", fileName: "c.csv", status: "completed" }, // extra (limit=2)
    ];
    setupDbChains(mockBatches);

    const res = await GET(makeRequest("http://localhost/api/imports?limit=2"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.pagination.hasMore).toBe(true);
    expect(body.pagination.nextCursor).toBe("batch-2");
  });

  it("includes rolled_back batches in list", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "company-1",
      role: "viewer",
    });

    const mockBatches = [
      {
        id: "batch-1",
        fileName: "old-import.csv",
        status: "rolled_back",
        rolledBackAt: "2026-03-16T12:00:00Z",
        importedCount: 50,
      },
    ];
    setupDbChains(mockBatches);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data[0].status).toBe("rolled_back");
    expect(body.data[0].rolledBackAt).toBeDefined();
  });
});
