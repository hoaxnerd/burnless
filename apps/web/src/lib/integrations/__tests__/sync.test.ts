/**
 * runIntegrationSync() — C2.4 sync runner (the integration HUB).
 *
 * Web vitest mocks the DB (happy-dom, no PGlite). We mock the connector source
 * (registry), credential lookup, account resolver, and ingest core, and wire a
 * minimal Drizzle chain for the read-modify-write of the `integrations` row.
 *
 * Behaviour under test:
 *  1. a charge-revenue + fee MappedRecord → two IngestRows with resolved
 *     accountIds, source:"integration", amount as STRING (Decimal boundary).
 *  2. metadata MERGE — sync updates metadata.sync WITHOUT dropping `livemode`.
 *  3. cursor = max(record date) in unix seconds.
 *  4. error path records metadata.sync.lastError and rethrows.
 *  5. no creds → throws a clear error.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  getDecryptedIntegrationSecret,
  registerConnectors,
  integrationRegistry,
  getAccounts,
  ingestRecords,
  mockSelect,
  mockFrom,
  mockWhere,
  mockLimit,
  mockUpdate,
  mockSet,
  mockUpdWhere,
  mockInsert,
  mockValues,
  mockReturning,
} = vi.hoisted(() => ({
  getDecryptedIntegrationSecret: vi.fn(),
  registerConnectors: vi.fn(),
  integrationRegistry: { get: vi.fn() },
  getAccounts: vi.fn(),
  ingestRecords: vi.fn(),
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockLimit: vi.fn(),
  mockUpdate: vi.fn(),
  mockSet: vi.fn(),
  mockUpdWhere: vi.fn(),
  mockInsert: vi.fn(),
  mockValues: vi.fn(),
  mockReturning: vi.fn(),
}));

vi.mock("@burnless/db", () => ({
  db: { select: mockSelect, update: mockUpdate, insert: mockInsert },
  integrations: { id: "id", companyId: "companyId", type: "type" },
  financialAccounts: { companyId: "companyId", name: "name" },
  getDecryptedIntegrationSecret,
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn() }));

vi.mock("../registry", () => ({ registerConnectors, integrationRegistry }));
// NOTE: ../accounts is NOT mocked — we exercise the REAL buildAccountResolver
// (the once-per-run resolver) so the duplicate-fees regression is genuine. Its
// deps (`@/lib/data` getAccounts + the financialAccounts insert) are mocked.
vi.mock("@/lib/data", () => ({ getAccounts }));
vi.mock("../ingest", () => ({ ingestRecords }));

import { runIntegrationSync } from "../sync";
import type { MappedRecord } from "../contracts";
import type { IngestRow } from "../ingest";

/** Captured update() payload. */
let updatedSet: Record<string, unknown> | null;
/** The integrations row the SELECT returns. */
let existingRow: { id: string; metadata: unknown } | null;
/** Captured financialAccounts insert() payloads (fees account create). */
let createdAccounts: Array<Record<string, unknown>>;

function source(records: MappedRecord[]) {
  return {
    source: {
      async *backfill() {
        for (const r of records) yield r;
      },
      async *incremental() {
        for (const r of records) yield r;
      },
    },
  };
}

function rec(over: Partial<MappedRecord> = {}): MappedRecord {
  return {
    externalId: "stripe:txn_a",
    date: new Date("2026-01-15T00:00:00Z"),
    amount: 100,
    currency: "usd",
    description: "Charge",
    categoryHint: "revenue",
    metadata: { reportingCategory: "charge" },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  updatedSet = null;
  createdAccounts = [];
  existingRow = { id: "i1", metadata: { livemode: true } };

  // SELECT chain → existing integrations row.
  mockSelect.mockReturnValue({ from: mockFrom });
  mockFrom.mockReturnValue({ where: mockWhere });
  mockWhere.mockReturnValue({ limit: mockLimit });
  mockLimit.mockImplementation(async () => (existingRow ? [existingRow] : []));

  // UPDATE chain → capture .set() payload.
  mockUpdate.mockReturnValue({ set: mockSet });
  mockSet.mockImplementation((vals: Record<string, unknown>) => {
    updatedSet = vals;
    return { where: mockUpdWhere };
  });
  mockUpdWhere.mockImplementation(async () => undefined);

  getDecryptedIntegrationSecret.mockResolvedValue({ apiKey: "rk_test_x" });

  // Default account list: an existing revenue account AND fees account, so the
  // common case resolves both hints without any create.
  getAccounts.mockResolvedValue([
    { id: "rev-acc", name: "Revenue", type: "income", category: "revenue" },
    {
      id: "fee-acc",
      name: "Payment processing fees",
      type: "expense",
      category: "operating_expense",
    },
  ]);

  // financialAccounts insert chain → capture .values() and return a new id.
  mockInsert.mockReturnValue({ values: mockValues });
  mockValues.mockImplementation((vals: Record<string, unknown>) => {
    createdAccounts.push(vals);
    return { returning: mockReturning };
  });
  mockReturning.mockImplementation(async () => [
    { id: "fee-new", ...createdAccounts[createdAccounts.length - 1] },
  ]);

  ingestRecords.mockResolvedValue({ inserted: 2, skipped: 0 });
  integrationRegistry.get.mockReturnValue(source([]));
});

describe("runIntegrationSync", () => {
  it("maps a charge-revenue + fee record into two IngestRows (resolved accounts, string amounts)", async () => {
    integrationRegistry.get.mockReturnValue(
      source([
        rec({ externalId: "stripe:txn_a", amount: 100, categoryHint: "revenue" }),
        rec({ externalId: "stripe:txn_a:fee", amount: -2.9, categoryHint: "payment_processing_fees" }),
      ])
    );

    const result = await runIntegrationSync("c1", "stripe", { mode: "incremental" });

    expect(result).toEqual({ inserted: 2, skipped: 0 });
    expect(ingestRecords).toHaveBeenCalledTimes(1);
    const [companyId, rows] = ingestRecords.mock.calls[0] as [string, IngestRow[]];
    expect(companyId).toBe("c1");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      accountId: "rev-acc",
      amount: "100",
      source: "integration",
      externalId: "stripe:txn_a",
      description: "Charge",
    });
    expect(rows[1]).toMatchObject({
      accountId: "fee-acc",
      amount: "-2.9",
      source: "integration",
      externalId: "stripe:txn_a:fee",
    });
    // Amounts are strings (Decimal boundary) — no number leaks through.
    expect(typeof rows[0]?.amount).toBe("string");
    expect(typeof rows[1]?.amount).toBe("string");
  });

  it("creates the fees account ONCE for a multi-fee backfill (no duplicate fees account)", async () => {
    // The fees account does NOT exist yet — only a revenue account.
    getAccounts.mockResolvedValue([
      { id: "rev-acc", name: "Revenue", type: "income", category: "revenue" },
    ]);
    // Two fee records in a SINGLE run.
    integrationRegistry.get.mockReturnValue(
      source([
        rec({ externalId: "stripe:fee_1", amount: -2.9, categoryHint: "payment_processing_fees" }),
        rec({ externalId: "stripe:fee_2", amount: -3.1, categoryHint: "payment_processing_fees" }),
      ])
    );

    await runIntegrationSync("c1", "stripe", { mode: "backfill" });

    // The fees account is INSERTed exactly once across the whole run...
    expect(createdAccounts).toHaveLength(1);
    expect(createdAccounts[0]).toMatchObject({
      name: "Payment processing fees",
      type: "expense",
    });

    // ...and getAccounts is read exactly once (per-run resolver, not per-record).
    expect(getAccounts).toHaveBeenCalledTimes(1);

    // ...and BOTH fee IngestRows carry the SAME (just-created) accountId.
    const [, rows] = ingestRecords.mock.calls[0] as [string, IngestRow[]];
    expect(rows).toHaveLength(2);
    expect(rows[0]?.accountId).toBe("fee-new");
    expect(rows[1]?.accountId).toBe("fee-new");
    expect(rows[0]?.accountId).toBe(rows[1]?.accountId);
  });

  it("merges metadata.sync without dropping livemode, and advances the cursor to max record date", async () => {
    const early = new Date("2026-01-10T00:00:00Z");
    const late = new Date("2026-03-20T00:00:00Z");
    integrationRegistry.get.mockReturnValue(
      source([
        rec({ externalId: "stripe:txn_a", date: early }),
        rec({ externalId: "stripe:txn_b", date: late }),
      ])
    );

    await runIntegrationSync("c1", "stripe", { mode: "incremental" });

    expect(updatedSet).not.toBeNull();
    const meta = updatedSet!.metadata as { livemode: boolean; sync: Record<string, unknown> };
    expect(meta.livemode).toBe(true); // preserved
    expect(meta.sync.cursor).toBe(Math.floor(late.getTime() / 1000));
    expect(meta.sync.lastError).toBeNull();
    expect(meta.sync.lastRecordCount).toBe(2);
    expect(updatedSet!.lastSyncAt).toBeInstanceOf(Date);
  });

  it("reads the existing cursor and passes it to incremental()", async () => {
    existingRow = { id: "i1", metadata: { livemode: false, sync: { cursor: 1700000000 } } };
    const incremental = vi.fn(async function* () {});
    integrationRegistry.get.mockReturnValue({ source: { backfill: vi.fn(), incremental } });

    await runIntegrationSync("c1", "stripe", { mode: "incremental" });

    expect(incremental).toHaveBeenCalledWith(
      { companyId: "c1", apiKey: "rk_test_x" },
      { created: 1700000000 }
    );
  });

  it("keeps the old cursor when no records are synced", async () => {
    existingRow = { id: "i1", metadata: { livemode: true, sync: { cursor: 1700000000 } } };
    integrationRegistry.get.mockReturnValue(source([]));

    await runIntegrationSync("c1", "stripe", { mode: "incremental" });

    const meta = updatedSet!.metadata as { sync: { cursor: number; lastRecordCount: number } };
    expect(meta.sync.cursor).toBe(1700000000);
    expect(meta.sync.lastRecordCount).toBe(0);
  });

  it("records lastError in metadata and rethrows on a sync failure", async () => {
    integrationRegistry.get.mockReturnValue(source([rec()]));
    ingestRecords.mockRejectedValue(new Error("boom"));

    await expect(runIntegrationSync("c1", "stripe", { mode: "incremental" })).rejects.toThrow("boom");

    expect(updatedSet).not.toBeNull();
    const meta = updatedSet!.metadata as { livemode: boolean; sync: { lastError: string } };
    expect(meta.livemode).toBe(true); // still preserved on the error write
    expect(meta.sync.lastError).toContain("boom");
  });

  it("throws a clear error when no credentials are stored", async () => {
    getDecryptedIntegrationSecret.mockResolvedValue(null);

    await expect(runIntegrationSync("c1", "stripe", { mode: "incremental" })).rejects.toThrow(
      /credential/i
    );
    expect(ingestRecords).not.toHaveBeenCalled();
  });
});
