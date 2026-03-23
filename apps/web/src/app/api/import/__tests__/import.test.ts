/**
 * Import API route tests — BUR-192
 *
 * Tests POST /api/import handler: auth, validation, account verification,
 * duplicate detection, dry run, batch creation, and error handling.
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
  mockInsert,
  mockValues,
  mockReturning,
  mockUpdate,
  mockSet,
  _mockLimit,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockInsert: vi.fn(),
  mockValues: vi.fn(),
  mockReturning: vi.fn(),
  mockUpdate: vi.fn(),
  mockSet: vi.fn(),
  _mockLimit: vi.fn(),
}));

const mockCategorizeWithMemory = vi.hoisted(() => vi.fn());

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

vi.mock("@burnless/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  },
  transactions: { companyId: "companyId", externalId: "externalId", importBatchId: "importBatchId" },
  financialAccounts: { id: "id", companyId: "companyId" },
  importBatches: { id: "id", companyId: "companyId" },
  merchantCategoryMappings: { companyId: "companyId" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  inArray: vi.fn(),
}));

vi.mock("@burnless/engine", () => ({
  categorizeWithMemory: mockCategorizeWithMemory,
}));

vi.mock("@/lib/api-rate-limit", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/financial-validation", () => ({
  monetaryAmount: () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { z } = require("zod");
    return z.number().finite();
  },
}));

// Wire up Drizzle chain mocks
function setupDbChains() {
  // SELECT chain: db.select({...}).from(...).where(...) → []
  mockSelect.mockReturnValue({ from: mockFrom });
  mockFrom.mockReturnValue({ where: mockWhere });
  mockWhere.mockReturnValue([]);

  // INSERT chain: db.insert(...).values(...).returning()
  mockInsert.mockReturnValue({ values: mockValues });
  mockValues.mockReturnValue({ returning: mockReturning });
  mockReturning.mockResolvedValue([{ id: "batch-1" }]);

  // UPDATE chain: db.update(...).set(...).where(...)
  mockUpdate.mockReturnValue({ set: mockSet });
  mockSet.mockReturnValue({ where: mockWhere });
}

import { POST } from "../route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validCtx() {
  return { userId: "user-1", companyId: "company-1", role: "editor" };
}

const validTx = {
  date: "2026-01-15",
  amount: -150.99,
  description: "AWS Monthly Bill",
  accountId: "acc-1",
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe("POST /api/import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDbChains();
    mockCategorizeWithMemory.mockReturnValue(null);
  });

  // ── Auth ────────────────────────────────────────────────────────────────

  it("returns 401 when unauthenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const res = await POST(makeRequest({ transactions: [validTx] }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 for viewer role", async () => {
    mockRequireCompanyAccess.mockResolvedValue(validCtx());
    mockRequireRole.mockReturnValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );

    const res = await POST(makeRequest({ transactions: [validTx] }));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  // ── Validation ──────────────────────────────────────────────────────────

  it("returns 400 for empty transactions array", async () => {
    mockRequireCompanyAccess.mockResolvedValue(validCtx());
    mockRequireRole.mockReturnValue(null);

    const res = await POST(makeRequest({ transactions: [] }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
  });

  it("returns 400 for missing transactions field", async () => {
    mockRequireCompanyAccess.mockResolvedValue(validCtx());
    mockRequireRole.mockReturnValue(null);

    const res = await POST(makeRequest({}));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
  });

  it("returns 400 for non-numeric amount", async () => {
    mockRequireCompanyAccess.mockResolvedValue(validCtx());
    mockRequireRole.mockReturnValue(null);

    const res = await POST(
      makeRequest({
        transactions: [{ ...validTx, amount: "$100" }],
      })
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
  });

  // ── Account validation ──────────────────────────────────────────────────

  it("reports error for invalid accountId", async () => {
    mockRequireCompanyAccess.mockResolvedValue(validCtx());
    mockRequireRole.mockReturnValue(null);

    // First SELECT returns valid accounts (empty = no valid accounts)
    let selectCallCount = 0;
    mockWhere.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return []; // No valid accounts found
      if (selectCallCount === 2) return []; // Merchant memory (empty)
      return []; // Default
    });

    const res = await POST(
      makeRequest({
        transactions: [validTx],
        dryRun: true,
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    // All transactions should have errors since acc-1 is not in valid accounts
    expect(body.errors.length).toBeGreaterThan(0);
    expect(body.errors[0].message).toContain("not found");
  });

  // ── Dry run ─────────────────────────────────────────────────────────────

  it("returns preview in dry run mode without inserting", async () => {
    mockRequireCompanyAccess.mockResolvedValue(validCtx());
    mockRequireRole.mockReturnValue(null);

    let selectCallCount = 0;
    mockWhere.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return [{ id: "acc-1" }]; // Valid accounts
      if (selectCallCount === 2) return []; // Merchant memory
      return []; // No duplicates
    });

    const res = await POST(
      makeRequest({
        transactions: [validTx],
        dryRun: true,
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.imported).toBe(1);
    expect(body.skipped).toBe(0);
    expect(body.transactions).toBeDefined();
    expect(body.transactions).toHaveLength(1);
    expect(body.transactions[0].isDuplicate).toBe(false);
    // Should NOT have inserted anything
    expect(mockInsert).not.toHaveBeenCalled();
  });

  // ── AI categorization ───────────────────────────────────────────────────

  it("includes AI categorization in dry run preview", async () => {
    mockRequireCompanyAccess.mockResolvedValue(validCtx());
    mockRequireRole.mockReturnValue(null);

    mockCategorizeWithMemory.mockReturnValue({
      subcategory: "cloud_infrastructure",
      confidence: 0.95,
      source: "merchant_memory",
    });

    let selectCallCount = 0;
    mockWhere.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return [{ id: "acc-1" }];
      if (selectCallCount === 2) return []; // Merchant mappings
      return [];
    });

    const res = await POST(
      makeRequest({
        transactions: [validTx],
        dryRun: true,
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.transactions[0].suggestedCategory).toBe("cloud_infrastructure");
    expect(body.transactions[0].categoryConfidence).toBe(0.95);
    expect(body.transactions[0].categorySource).toBe("merchant_memory");
  });

  it("skips categorization for null descriptions", async () => {
    mockRequireCompanyAccess.mockResolvedValue(validCtx());
    mockRequireRole.mockReturnValue(null);

    let selectCallCount = 0;
    mockWhere.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return [{ id: "acc-1" }];
      if (selectCallCount === 2) return [];
      return [];
    });

    const res = await POST(
      makeRequest({
        transactions: [{ ...validTx, description: null }],
        dryRun: true,
      })
    );
    const _body = await res.json();

    expect(res.status).toBe(200);
    // categorizeWithMemory should NOT have been called for null description
    expect(mockCategorizeWithMemory).not.toHaveBeenCalled();
  });

  // ── Successful import ───────────────────────────────────────────────────

  it("creates import batch and inserts transactions on real import", async () => {
    mockRequireCompanyAccess.mockResolvedValue(validCtx());
    mockRequireRole.mockReturnValue(null);

    let selectCallCount = 0;
    mockWhere.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return [{ id: "acc-1" }];
      if (selectCallCount === 2) return []; // Merchant memory
      return []; // No duplicates
    });

    // Insert batch returns batch record
    mockReturning.mockResolvedValue([{ id: "batch-123" }]);
    // Insert transactions succeeds
    mockValues.mockReturnValue({ returning: mockReturning });

    const res = await POST(
      makeRequest({
        transactions: [validTx],
        fileName: "mercury-export.csv",
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.imported).toBe(1);
    expect(body.skipped).toBe(0);
    expect(body.batchId).toBe("batch-123");
    // Should have called insert for the batch AND for transactions
    expect(mockInsert).toHaveBeenCalled();
  });

  // ── Invalid date handling ───────────────────────────────────────────────

  it("reports error for invalid date format", async () => {
    mockRequireCompanyAccess.mockResolvedValue(validCtx());
    mockRequireRole.mockReturnValue(null);

    let selectCallCount = 0;
    mockWhere.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return [{ id: "acc-1" }];
      if (selectCallCount === 2) return [];
      return [];
    });

    const res = await POST(
      makeRequest({
        transactions: [{ ...validTx, date: "not-a-date" }],
        dryRun: true,
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.errors.length).toBeGreaterThan(0);
    expect(body.errors[0].message).toContain("Invalid date");
  });

  // ── Custom externalId ───────────────────────────────────────────────────

  it("uses provided externalId when present", async () => {
    mockRequireCompanyAccess.mockResolvedValue(validCtx());
    mockRequireRole.mockReturnValue(null);

    let selectCallCount = 0;
    mockWhere.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return [{ id: "acc-1" }];
      if (selectCallCount === 2) return [];
      return [];
    });

    const res = await POST(
      makeRequest({
        transactions: [{ ...validTx, externalId: "custom-ext-id" }],
        dryRun: true,
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.transactions[0].externalId).toBe("custom-ext-id");
  });

  // ── Negative and zero amounts ───────────────────────────────────────────

  it("accepts negative amounts (debits)", async () => {
    mockRequireCompanyAccess.mockResolvedValue(validCtx());
    mockRequireRole.mockReturnValue(null);

    let selectCallCount = 0;
    mockWhere.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return [{ id: "acc-1" }];
      if (selectCallCount === 2) return [];
      return [];
    });

    const res = await POST(
      makeRequest({
        transactions: [{ ...validTx, amount: -9999.99 }],
        dryRun: true,
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.imported).toBe(1);
  });

  it("accepts zero amount", async () => {
    mockRequireCompanyAccess.mockResolvedValue(validCtx());
    mockRequireRole.mockReturnValue(null);

    let selectCallCount = 0;
    mockWhere.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return [{ id: "acc-1" }];
      if (selectCallCount === 2) return [];
      return [];
    });

    const res = await POST(
      makeRequest({
        transactions: [{ ...validTx, amount: 0 }],
        dryRun: true,
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.imported).toBe(1);
  });

  // ── Defaults ────────────────────────────────────────────────────────────

  it("defaults fileName to 'import.csv'", async () => {
    mockRequireCompanyAccess.mockResolvedValue(validCtx());
    mockRequireRole.mockReturnValue(null);

    let selectCallCount = 0;
    mockWhere.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return [{ id: "acc-1" }];
      if (selectCallCount === 2) return [];
      return [];
    });
    mockReturning.mockResolvedValue([{ id: "batch-1" }]);

    const res = await POST(
      makeRequest({ transactions: [validTx] })
    );

    expect(res.status).toBe(200);
    // Batch insert should have been called (fileName defaults internally)
    expect(mockInsert).toHaveBeenCalled();
  });
});
