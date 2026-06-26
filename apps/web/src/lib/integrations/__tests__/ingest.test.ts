/**
 * ingestRecords() shared core — C2.1
 *
 * The web vitest suite mocks the DB (happy-dom, no PGlite) — same harness the
 * import-route tests use. We wire a minimal Drizzle chain so we can drive the
 * dedup query (the existing-id SELECT) and capture the chunked INSERT.
 *
 * Behaviour under test:
 *  - inserting 2 records then re-running inserts 0 (idempotent on externalId)
 *  - an in-batch duplicate is skipped exactly once
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSelect, mockFrom, mockWhere, mockInsert, mockValues } = vi.hoisted(
  () => ({
    mockSelect: vi.fn(),
    mockFrom: vi.fn(),
    mockWhere: vi.fn(),
    mockInsert: vi.fn(),
    mockValues: vi.fn(),
  })
);

vi.mock("@burnless/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
  },
  transactions: { companyId: "companyId", externalId: "externalId" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  inArray: vi.fn(),
}));

import { ingestRecords, type IngestRow } from "../ingest";

/** Capture of every db.insert(transactions).values(rows) payload. */
let insertedRows: IngestRow[][];
/** externalIds the dedup SELECT should report as already existing. */
let existingExternalIds: string[];

function setupDbChains() {
  // SELECT chain: db.select({...}).from(...).where(...) → existing rows.
  // We echo back whichever existing ids we've seeded (the route filters by
  // inArray, but the mock can't see the clause, so we return the full set and
  // the real query semantics are exercised by the integration / route tests).
  mockSelect.mockReturnValue({ from: mockFrom });
  mockFrom.mockReturnValue({ where: mockWhere });
  mockWhere.mockImplementation(() =>
    existingExternalIds.map((externalId) => ({ externalId }))
  );

  // INSERT chain: db.insert(transactions).values(rows)
  mockInsert.mockReturnValue({ values: mockValues });
  mockValues.mockImplementation((rows: IngestRow[]) => {
    insertedRows.push(rows);
    return Promise.resolve();
  });
}

function row(externalId: string, overrides: Partial<IngestRow> = {}): IngestRow {
  return {
    accountId: "acc-1",
    date: new Date("2026-01-15"),
    amount: "-150.99",
    description: "AWS Monthly Bill",
    vendor: null,
    source: "integration",
    externalId,
    metadata: null,
    ...overrides,
  };
}

describe("ingestRecords", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertedRows = [];
    existingExternalIds = [];
    setupDbChains();
  });

  it("inserts new records, then re-running the same set inserts 0 (idempotent on externalId)", async () => {
    // First run: nothing exists yet.
    const first = await ingestRecords("company-1", [
      row("stripe:txn_a"),
      row("stripe:txn_b"),
    ]);

    expect(first).toEqual({ inserted: 2, skipped: 0 });
    const firstInserted = insertedRows.flat();
    expect(firstInserted).toHaveLength(2);
    expect(firstInserted.map((r) => r.externalId)).toEqual([
      "stripe:txn_a",
      "stripe:txn_b",
    ]);

    // Second run: both externalIds now exist in the DB → 0 inserted.
    insertedRows = [];
    existingExternalIds = ["stripe:txn_a", "stripe:txn_b"];

    const second = await ingestRecords("company-1", [
      row("stripe:txn_a"),
      row("stripe:txn_b"),
    ]);

    expect(second).toEqual({ inserted: 0, skipped: 2 });
    expect(insertedRows.flat()).toHaveLength(0);
  });

  it("skips an in-batch duplicate exactly once", async () => {
    const result = await ingestRecords("company-1", [
      row("stripe:txn_a"),
      row("stripe:txn_a"), // duplicate within the same batch
      row("stripe:txn_b"),
    ]);

    expect(result).toEqual({ inserted: 2, skipped: 1 });
    const inserted = insertedRows.flat();
    expect(inserted.map((r) => r.externalId)).toEqual([
      "stripe:txn_a",
      "stripe:txn_b",
    ]);
  });

  it("carries each row's own source and the optional importBatchId onto the insert", async () => {
    await ingestRecords(
      "company-1",
      [row("stripe:txn_a", { source: "import" })],
      { importBatchId: "batch-9" }
    );

    const inserted = insertedRows.flat();
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      source: "import",
      importBatchId: "batch-9",
      externalId: "stripe:txn_a",
    });
  });
});
