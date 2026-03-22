/**
 * Import rollback API route tests — BUR-192
 *
 * Tests DELETE /api/imports/[batchId] handler: auth, role check,
 * batch ownership, status validation, and rollback execution.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// ── Hoisted mocks ──────────────────────────────────────────────────────────

const { mockRequireCompanyAccess, mockRequireRole } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockRequireRole: vi.fn().mockReturnValue(null),
}));

const {
  mockSelect,
  mockFrom,
  mockWhere,
  mockLimit,
  mockDelete,
  mockUpdate,
  mockSet,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockLimit: vi.fn(),
  mockDelete: vi.fn(),
  mockUpdate: vi.fn(),
  mockSet: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  requireRole: mockRequireRole,
  errorResponse: (msg: string, status: number) =>
    NextResponse.json({ error: msg }, { status }),
  withErrorHandler: (fn: Function) => fn,
}));

vi.mock("@burnless/db", () => ({
  db: {
    select: mockSelect,
    delete: mockDelete,
    update: mockUpdate,
  },
  importBatches: {
    id: "id",
    companyId: "companyId",
    status: "status",
  },
  transactions: {
    companyId: "companyId",
    importBatchId: "importBatchId",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

function setupDbChains(batchResult: unknown[] = []) {
  // SELECT chain: db.select().from(importBatches).where(...).limit(1)
  mockSelect.mockReturnValue({ from: mockFrom });
  mockFrom.mockReturnValue({ where: mockWhere });
  mockWhere.mockReturnValue({ limit: mockLimit });
  mockLimit.mockResolvedValue(batchResult);

  // DELETE chain: db.delete(transactions).where(...)
  mockDelete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });

  // UPDATE chain: db.update(importBatches).set({...}).where(...)
  mockUpdate.mockReturnValue({ set: mockSet });
  mockSet.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
}

import { DELETE } from "../[batchId]/route";

function makeRequest(): Request {
  return new Request("http://localhost/api/imports/batch-1", { method: "DELETE" });
}

function makeParams(batchId = "batch-1") {
  return { params: Promise.resolve({ batchId }) };
}

function validCtx() {
  return { userId: "user-1", companyId: "company-1", role: "editor" };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("DELETE /api/imports/[batchId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDbChains();
  });

  // ── Auth ────────────────────────────────────────────────────────────────

  it("returns 401 when unauthenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const res = await DELETE(makeRequest(), makeParams());
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 for viewer role", async () => {
    mockRequireCompanyAccess.mockResolvedValue(validCtx());
    mockRequireRole.mockReturnValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );

    const res = await DELETE(makeRequest(), makeParams());
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  // ── Batch not found ─────────────────────────────────────────────────────

  it("returns 404 when batch does not exist", async () => {
    mockRequireCompanyAccess.mockResolvedValue(validCtx());
    mockRequireRole.mockReturnValue(null);
    setupDbChains([]); // No batch found

    const res = await DELETE(makeRequest(), makeParams("nonexistent-id"));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Import batch not found");
  });

  // ── Status validation ───────────────────────────────────────────────────

  it("returns 400 when batch already rolled back", async () => {
    mockRequireCompanyAccess.mockResolvedValue(validCtx());
    mockRequireRole.mockReturnValue(null);
    setupDbChains([{
      id: "batch-1",
      companyId: "company-1",
      status: "rolled_back",
      importedCount: 50,
    }]);

    const res = await DELETE(makeRequest(), makeParams());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Batch has already been rolled back");
  });

  it("returns 400 when batch is not completed (processing)", async () => {
    mockRequireCompanyAccess.mockResolvedValue(validCtx());
    mockRequireRole.mockReturnValue(null);
    setupDbChains([{
      id: "batch-1",
      companyId: "company-1",
      status: "processing",
      importedCount: 0,
    }]);

    const res = await DELETE(makeRequest(), makeParams());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Only completed imports can be rolled back");
  });

  it("returns 400 when batch is failed", async () => {
    mockRequireCompanyAccess.mockResolvedValue(validCtx());
    mockRequireRole.mockReturnValue(null);
    setupDbChains([{
      id: "batch-1",
      companyId: "company-1",
      status: "failed",
      importedCount: 0,
    }]);

    const res = await DELETE(makeRequest(), makeParams());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Only completed imports can be rolled back");
  });

  it("returns 400 when batch is pending", async () => {
    mockRequireCompanyAccess.mockResolvedValue(validCtx());
    mockRequireRole.mockReturnValue(null);
    setupDbChains([{
      id: "batch-1",
      companyId: "company-1",
      status: "pending",
      importedCount: 0,
    }]);

    const res = await DELETE(makeRequest(), makeParams());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Only completed imports can be rolled back");
  });

  // ── Successful rollback ─────────────────────────────────────────────────

  it("rolls back completed batch successfully", async () => {
    mockRequireCompanyAccess.mockResolvedValue(validCtx());
    mockRequireRole.mockReturnValue(null);
    setupDbChains([{
      id: "batch-1",
      companyId: "company-1",
      status: "completed",
      importedCount: 95,
    }]);

    const res = await DELETE(makeRequest(), makeParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe("Rolled back 95 transactions");
    // Should have called delete on transactions and update on batch
    expect(mockDelete).toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("includes correct transaction count in rollback message", async () => {
    mockRequireCompanyAccess.mockResolvedValue(validCtx());
    mockRequireRole.mockReturnValue(null);
    setupDbChains([{
      id: "batch-1",
      companyId: "company-1",
      status: "completed",
      importedCount: 1,
    }]);

    const res = await DELETE(makeRequest(), makeParams());
    const body = await res.json();

    expect(body.message).toBe("Rolled back 1 transactions");
  });
});
