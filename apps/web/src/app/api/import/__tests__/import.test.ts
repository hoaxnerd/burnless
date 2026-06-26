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
  mockOnConflict,
  mockUpdate,
  mockSet,
  mockLimit,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockInsert: vi.fn(),
  mockValues: vi.fn(),
  mockReturning: vi.fn(),
  mockOnConflict: vi.fn(),
  mockUpdate: vi.fn(),
  mockSet: vi.fn(),
  mockLimit: vi.fn(),
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
  financialAccounts: { id: "id", companyId: "companyId", name: "name" },
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
  // Also supports .where(...).limit(N) via mockLimit
  mockSelect.mockReturnValue({ from: mockFrom });
  mockFrom.mockReturnValue({ where: mockWhere });
  // Default: where returns an array-like that ALSO exposes .limit(),
  // so callers can either await it directly or chain .limit(N).
  // mockLimit defaults to returning [] (no rows).
  mockLimit.mockReturnValue([]);
  const defaultWhereResult = Object.assign([] as unknown[], { limit: mockLimit });
  mockWhere.mockReturnValue(defaultWhereResult);

  // INSERT chain: db.insert(...).values(...).returning()  — batches use .returning();
  // the shared ingest core (M2) chains .onConflictDoNothing() instead, so the
  // values() result carries BOTH terminators.
  mockInsert.mockReturnValue({ values: mockValues });
  mockValues.mockReturnValue({ returning: mockReturning, onConflictDoNothing: mockOnConflict });
  mockReturning.mockResolvedValue([{ id: "batch-1" }]);
  mockOnConflict.mockResolvedValue(undefined);

  // UPDATE chain: db.update(...).set(...).where(...)
  mockUpdate.mockReturnValue({ set: mockSet });
  mockSet.mockReturnValue({ where: mockWhere });
}

// Helper: make any array also satisfy `.limit(N)` chain.
function arrWithLimit(arr: unknown[], limitResult: unknown[] = arr) {
  return Object.assign([...arr], { limit: () => limitResult });
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
    mockValues.mockReturnValue({ returning: mockReturning, onConflictDoNothing: mockOnConflict });

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

  // ── Vendor / notes write-through (Phase 1 §2.C) ─────────────────────────

  it("persists vendor and notes columns on insert", async () => {
    mockRequireCompanyAccess.mockResolvedValue(validCtx());
    mockRequireRole.mockReturnValue(null);

    let selectCallCount = 0;
    mockWhere.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return [{ id: "acc-1" }]; // valid accounts
      if (selectCallCount === 2) return []; // merchant memory
      return []; // duplicates
    });
    mockReturning.mockResolvedValue([{ id: "batch-vendor" }]);

    // Capture every values() call
    const valuesCalls: unknown[][] = [];
    mockValues.mockImplementation((v: unknown) => {
      valuesCalls.push(Array.isArray(v) ? (v as unknown[]) : [v]);
      return { returning: mockReturning, onConflictDoNothing: mockOnConflict };
    });

    const res = await POST(
      makeRequest({
        transactions: [
          {
            ...validTx,
            vendor: "Slack",
            notes: "Annual",
          },
        ],
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.imported).toBe(1);

    // Find the insert-transactions call (an array of rows w/ vendor field)
    const txInsertCall = valuesCalls.find(
      (call) =>
        Array.isArray(call) &&
        call.length > 0 &&
        typeof call[0] === "object" &&
        call[0] !== null &&
        "vendor" in (call[0] as Record<string, unknown>)
    );
    expect(txInsertCall).toBeDefined();
    const row = (txInsertCall as Record<string, unknown>[])[0]!;
    expect(row.vendor).toBe("Slack");
    expect(row.notes).toBe("Annual");
  });

  // ── Imported account fallback (Phase 1 §2.C) ────────────────────────────

  it("auto-creates 'Imported' account for sentinel accountId and reuses it", async () => {
    mockRequireCompanyAccess.mockResolvedValue(validCtx());
    mockRequireRole.mockReturnValue(null);

    // Track all insert targets (first arg to db.insert(...))
    const insertTargets: unknown[] = [];
    mockInsert.mockImplementation((target: unknown) => {
      insertTargets.push(target);
      return { values: mockValues };
    });

    // Track values to identify which insert it is
    const valuesCalls: { target: unknown; values: unknown }[] = [];
    mockValues.mockImplementation((v: unknown) => {
      valuesCalls.push({ target: insertTargets[insertTargets.length - 1], values: v });
      return { returning: mockReturning, onConflictDoNothing: mockOnConflict };
    });

    // Call order: 1=valid accounts, 2=merchant memory, 3=ensureImportedAccount lookup, 4=duplicates
    let selectCallCount = 0;
    mockWhere.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return []; // valid accounts: empty (sentinel anyway)
      if (selectCallCount === 2) return []; // merchant memory
      if (selectCallCount === 3) {
        // ensureImportedAccount lookup → empty (use .limit chain)
        return arrWithLimit([], []);
      }
      return []; // duplicates
    });

    // Returning: order is (1) ensureImportedAccount creates → [{id: "imp-1"}]
    //                    (2) batch row → [{id: "batch-imp"}]
    let returningCallCount = 0;
    mockReturning.mockImplementation(async () => {
      returningCallCount++;
      if (returningCallCount === 1) return [{ id: "imp-1" }];
      if (returningCallCount === 2) return [{ id: "batch-imp" }];
      return [];
    });

    const res1 = await POST(
      makeRequest({
        transactions: [{ ...validTx, accountId: "__imported__" }],
      })
    );
    const body1 = await res1.json();

    expect(res1.status).toBe(200);
    expect(body1.imported).toBe(1);

    // Confirm financialAccounts insert happened with correct shape
    const accInsert = valuesCalls.find(
      (c) =>
        c.values &&
        typeof c.values === "object" &&
        !Array.isArray(c.values) &&
        "name" in (c.values as Record<string, unknown>) &&
        (c.values as Record<string, unknown>).name === "Imported"
    );
    expect(accInsert).toBeDefined();
    const accRow = accInsert!.values as Record<string, unknown>;
    expect(accRow.type).toBe("expense");
    expect(accRow.category).toBe("operating_expense");

    // Confirm transaction row points at the auto-created account
    const txInsert = valuesCalls.find(
      (c) =>
        Array.isArray(c.values) &&
        c.values.length > 0 &&
        typeof (c.values as unknown[])[0] === "object" &&
        "vendor" in ((c.values as unknown[])[0] as Record<string, unknown>)
    );
    expect(txInsert).toBeDefined();
    const txRow = (txInsert!.values as Record<string, unknown>[])[0]!;
    expect(txRow.accountId).toBe("imp-1");

    // ── Second POST: should REUSE existing Imported account ──────────────
    valuesCalls.length = 0;
    insertTargets.length = 0;
    selectCallCount = 0;
    returningCallCount = 0;

    mockWhere.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return []; // valid accounts: empty
      if (selectCallCount === 2) return []; // merchant memory
      if (selectCallCount === 3) {
        // ensureImportedAccount: now returns existing via .limit chain
        return arrWithLimit([], [{ id: "imp-1" }]);
      }
      return []; // duplicates
    });
    mockReturning.mockImplementation(async () => {
      returningCallCount++;
      // Now only 1 returning call (batch creation), no account insert
      if (returningCallCount === 1) return [{ id: "batch-imp-2" }];
      return [];
    });

    const res2 = await POST(
      makeRequest({
        transactions: [
          {
            ...validTx,
            accountId: "__imported__",
            description: "Different desc to avoid dedupe",
          },
        ],
      })
    );
    const body2 = await res2.json();

    expect(res2.status).toBe(200);
    expect(body2.imported).toBe(1);

    // No second financialAccounts insert this time — verify by checking
    // that no values call has name === "Imported"
    const dupAccInsert = valuesCalls.find(
      (c) =>
        c.values &&
        typeof c.values === "object" &&
        !Array.isArray(c.values) &&
        "name" in (c.values as Record<string, unknown>) &&
        (c.values as Record<string, unknown>).name === "Imported"
    );
    expect(dupAccInsert).toBeUndefined();

    // Tx should still point at imp-1
    const txInsert2 = valuesCalls.find(
      (c) =>
        Array.isArray(c.values) &&
        c.values.length > 0 &&
        typeof (c.values as unknown[])[0] === "object" &&
        "vendor" in ((c.values as unknown[])[0] as Record<string, unknown>)
    );
    expect(txInsert2).toBeDefined();
    const txRow2 = (txInsert2!.values as Record<string, unknown>[])[0]!;
    expect(txRow2.accountId).toBe("imp-1");
  });

  // ── accountId-aware externalId hashing (Phase 1 §2.C) ───────────────────

  it("treats identical (date, amount, description) on different accounts as distinct", async () => {
    mockRequireCompanyAccess.mockResolvedValue(validCtx());
    mockRequireRole.mockReturnValue(null);

    let selectCallCount = 0;
    mockWhere.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return [{ id: "acc-A" }, { id: "acc-B" }];
      if (selectCallCount === 2) return []; // merchant memory
      return []; // No existing duplicates
    });
    mockReturning.mockResolvedValue([{ id: "batch-multi" }]);

    const valuesCalls: unknown[][] = [];
    mockValues.mockImplementation((v: unknown) => {
      valuesCalls.push(Array.isArray(v) ? (v as unknown[]) : [v]);
      return { returning: mockReturning, onConflictDoNothing: mockOnConflict };
    });

    const res = await POST(
      makeRequest({
        transactions: [
          { ...validTx, accountId: "acc-A" },
          { ...validTx, accountId: "acc-B" },
        ],
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.imported).toBe(2);
    expect(body.skipped).toBe(0);

    // Find the tx insert; both rows should have DIFFERENT externalIds
    const txInsert = valuesCalls.find(
      (call) =>
        Array.isArray(call) &&
        call.length === 2 &&
        typeof call[0] === "object" &&
        "externalId" in (call[0] as Record<string, unknown>)
    );
    expect(txInsert).toBeDefined();
    const rows = txInsert as Record<string, unknown>[];
    expect(rows[0]!.externalId).not.toBe(rows[1]!.externalId);
  });

  // ── Re-import dedupe regression ─────────────────────────────────────────

  it("skips all rows on re-import (existing externalIds match)", async () => {
    mockRequireCompanyAccess.mockResolvedValue(validCtx());
    mockRequireRole.mockReturnValue(null);

    // Compute the externalId the route will generate for validTx + acc-1
    // We only need the duplicates lookup to return whatever the route asks for.
    // Easiest: have the duplicates select return a row whose externalId matches
    // anything by echoing whatever was queried via inArray. Since we can't
    // intercept the inArray clause through the mock chain, instead:
    // the route inserts into a Set from the rows we return. So return a row
    // that we know matches. The route generates an externalId from
    // (date|amount|description|accountId). Just echo back ANY string that
    // matches what `prepared` produced — easier: return the same row spec by
    // simulating the route's hash. But we can't easily compute it in the test
    // without duplicating the hash. Simpler approach: stub the duplicates
    // SELECT to return `[{ externalId: <echo> }]` for whatever is asked.
    // The route iterates `existing` and adds each `row.externalId` to the
    // dedupe set. We can match by having the duplicates query return ALL the
    // externalIds the route is asking about, by delegating through a captured
    // value. But the .where chain doesn't expose its arg in this mock setup.
    //
    // Easier path: we know the dedupe loop matches by string equality. We can
    // capture the externalId the route uses by intercepting the FIRST insert
    // attempt (dry run) — but we want a real import here, not dry.
    //
    // Cleanest: do a first "dry run" pass to learn the externalId, then a
    // second real pass with the duplicates select pre-seeded to that id.
    let capturedExternalId: string | null = null;
    let selectCount1 = 0;
    mockWhere.mockImplementation(() => {
      selectCount1++;
      if (selectCount1 === 1) return [{ id: "acc-1" }];
      if (selectCount1 === 2) return [];
      return [];
    });
    const valuesCalls1: unknown[][] = [];
    mockValues.mockImplementation((v: unknown) => {
      valuesCalls1.push(Array.isArray(v) ? (v as unknown[]) : [v]);
      return { returning: mockReturning, onConflictDoNothing: mockOnConflict };
    });

    const dry = await POST(
      makeRequest({
        transactions: [validTx],
        dryRun: true,
      })
    );
    const dryBody = await dry.json();
    expect(dry.status).toBe(200);
    capturedExternalId = dryBody.transactions[0].externalId;
    expect(capturedExternalId).toMatch(/^import:/);

    // ── Now real import: dedupe select returns the captured externalId ──
    let selectCount2 = 0;
    mockWhere.mockImplementation(() => {
      selectCount2++;
      if (selectCount2 === 1) return [{ id: "acc-1" }];
      if (selectCount2 === 2) return []; // merchant memory
      return [{ externalId: capturedExternalId }]; // duplicates: match
    });
    mockReturning.mockResolvedValue([{ id: "batch-redup" }]);

    const res = await POST(
      makeRequest({ transactions: [validTx] })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.imported).toBe(0);
    expect(body.skipped).toBe(1);
  });
});
