/**
 * runIntegrationSync() — C3.2 trailing-window reconciliation.
 *
 * Stripe `created`-cursor incremental sync would miss recent mutations whose
 * own balance_transaction predates the stored cursor only by virtue of being
 * re-listed (e.g. a refund of an old charge). To be safe, the INCREMENTAL path
 * re-scans a trailing window: it fetches `created > min(cursor, now − 7d)`.
 *
 * Two invariants under test:
 *  1. trailing floor — incremental() is called with `created = min(cursor, now − 7d)`,
 *     so a refund created INSIDE the window but BEFORE the cursor is re-fetched.
 *  2. cursor MONOTONIC — the trailing re-scan must NEVER rewind the stored cursor
 *     below its prior high-water mark, even when the max record date it sees is
 *     older than the prior cursor.
 *  3. backfill is UNCHANGED — no trailing floor, no cursor floor.
 *
 * Web vitest mocks the DB (happy-dom, no PGlite). Mirrors sync.test.ts harness.
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
vi.mock("@/lib/data", () => ({ getAccounts }));
vi.mock("../ingest", () => ({ ingestRecords }));

import { runIntegrationSync } from "../sync";
import type { MappedRecord } from "../contracts";

const DAY = 86400;
const TRAILING_DAYS = 7;

let updatedSet: Record<string, unknown> | null;
let existingRow: { id: string; metadata: unknown } | null;

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
  existingRow = { id: "i1", metadata: { livemode: true } };

  mockSelect.mockReturnValue({ from: mockFrom });
  mockFrom.mockReturnValue({ where: mockWhere });
  mockWhere.mockReturnValue({ limit: mockLimit });
  mockLimit.mockImplementation(async () => (existingRow ? [existingRow] : []));

  mockUpdate.mockReturnValue({ set: mockSet });
  mockSet.mockImplementation((vals: Record<string, unknown>) => {
    updatedSet = vals;
    return { where: mockUpdWhere };
  });
  mockUpdWhere.mockImplementation(async () => undefined);

  getDecryptedIntegrationSecret.mockResolvedValue({ apiKey: "rk_test_x" });

  getAccounts.mockResolvedValue([
    { id: "rev-acc", name: "Revenue", type: "income", category: "revenue" },
    {
      id: "fee-acc",
      name: "Payment processing fees",
      type: "expense",
      category: "operating_expense",
    },
  ]);

  mockInsert.mockReturnValue({ values: mockValues });
  mockValues.mockReturnValue({ returning: mockReturning });
  mockReturning.mockResolvedValue([{ id: "fee-new" }]);

  ingestRecords.mockResolvedValue({ inserted: 1, skipped: 0 });
});

describe("runIntegrationSync — trailing-window reconciliation (incremental)", () => {
  it("re-scans the trailing window: incremental() floor = min(cursor, now − 7d), so an old-but-recent refund is re-fetched", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    // Cursor is well past the refund's creation date (cursor at "now").
    const prevCursor = nowSec;
    existingRow = { id: "i1", metadata: { livemode: true, sync: { cursor: prevCursor } } };

    // A refund whose own balance_transaction was created 2 days ago — INSIDE the
    // 7-day window but BEFORE the cursor. Without the trailing floor it'd be missed.
    const refundDate = new Date((nowSec - 2 * DAY) * 1000);
    const incremental = vi.fn(async function* () {
      yield rec({ externalId: "stripe:re_1", amount: -50, date: refundDate });
    });
    integrationRegistry.get.mockReturnValue({ source: { backfill: vi.fn(), incremental } });

    await runIntegrationSync("c1", "stripe", { mode: "incremental" });

    // incremental() is called with the trailing FLOOR, not the raw cursor.
    const expectedFloor = Math.min(prevCursor, nowSec - TRAILING_DAYS * DAY);
    expect(incremental).toHaveBeenCalledTimes(1);
    const passedCursor = (incremental.mock.calls[0] as unknown as [unknown, { created: number }])[1];
    expect(passedCursor.created).toBe(expectedFloor);
    expect(passedCursor.created).toBeLessThan(prevCursor); // re-fetches older-than-cursor
  });

  it("keeps the stored cursor MONOTONIC: a trailing re-scan that only sees old records does NOT rewind the cursor", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const prevCursor = nowSec; // high-water mark at "now"
    existingRow = { id: "i1", metadata: { livemode: true, sync: { cursor: prevCursor } } };

    // The trailing re-scan only re-sees a record from 3 days ago (older than cursor).
    const oldDate = new Date((nowSec - 3 * DAY) * 1000);
    const incremental = vi.fn(async function* () {
      yield rec({ externalId: "stripe:re_old", amount: -10, date: oldDate });
    });
    integrationRegistry.get.mockReturnValue({ source: { backfill: vi.fn(), incremental } });

    await runIntegrationSync("c1", "stripe", { mode: "incremental" });

    const meta = updatedSet!.metadata as { sync: { cursor: number } };
    // Cursor must NOT regress below the prior high-water mark.
    expect(meta.sync.cursor).toBe(prevCursor);
    expect(meta.sync.cursor).toBeGreaterThanOrEqual(prevCursor);
  });

  it("advances the cursor when the trailing re-scan DOES see a newer record", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const prevCursor = nowSec - 10 * DAY;
    existingRow = { id: "i1", metadata: { livemode: true, sync: { cursor: prevCursor } } };

    const newer = new Date((nowSec - 1 * DAY) * 1000);
    const incremental = vi.fn(async function* () {
      yield rec({ externalId: "stripe:txn_new", date: newer });
    });
    integrationRegistry.get.mockReturnValue({ source: { backfill: vi.fn(), incremental } });

    await runIntegrationSync("c1", "stripe", { mode: "incremental" });

    const meta = updatedSet!.metadata as { sync: { cursor: number } };
    expect(meta.sync.cursor).toBe(Math.floor(newer.getTime() / 1000));
  });

  it("backfill is UNCHANGED: no trailing floor (backfill() called, incremental() not)", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    existingRow = { id: "i1", metadata: { livemode: true, sync: { cursor: nowSec } } };

    const backfill = vi.fn(async function* () {
      yield rec();
    });
    const incremental = vi.fn(async function* () {});
    integrationRegistry.get.mockReturnValue({ source: { backfill, incremental } });

    await runIntegrationSync("c1", "stripe", { mode: "backfill" });

    expect(backfill).toHaveBeenCalledTimes(1);
    expect(incremental).not.toHaveBeenCalled();
  });

  it("first incremental sync (no prior cursor) passes a null cursor — full history, no trailing floor", async () => {
    existingRow = { id: "i1", metadata: { livemode: true } }; // no sync.cursor
    const incremental = vi.fn(async function* () {});
    integrationRegistry.get.mockReturnValue({ source: { backfill: vi.fn(), incremental } });

    await runIntegrationSync("c1", "stripe", { mode: "incremental" });

    expect(incremental).toHaveBeenCalledWith({ companyId: "c1", apiKey: "rk_test_x" }, null);
  });
});
