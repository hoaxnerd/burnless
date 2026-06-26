/**
 * runAllIntegrationSyncs() — the periodic driver behind the `integration-sync`
 * SYSTEM_JOB. It selects every ACTIVE integration across all companies and runs
 * an incremental `runIntegrationSync` for each, error-isolated: one thrown sync
 * is counted as `failed` and MUST NOT stop the rest.
 *
 * Web vitest mocks the DB (happy-dom, no PGlite). We mock the `integrations`
 * select to return two active rows and mock `runIntegrationSync`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSelect, mockFrom, mockWhere, runIntegrationSync } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  runIntegrationSync: vi.fn(),
}));

vi.mock("@burnless/db", () => ({
  db: { select: mockSelect },
  integrations: { status: "status", companyId: "companyId", type: "type" },
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));

vi.mock("@/lib/integrations/sync", () => ({ runIntegrationSync }));

vi.mock("@/lib/logger", () => ({
  logger: () => ({ error: vi.fn() }),
}));

import { runAllIntegrationSyncs } from "../run-all-syncs";

const ACTIVE_ROWS = [
  { companyId: "co-1", type: "stripe" },
  { companyId: "co-2", type: "stripe" },
];

beforeEach(() => {
  vi.clearAllMocks();
  // db.select().from(integrations).where(eq(status, "active")) → ACTIVE_ROWS
  mockSelect.mockReturnValue({ from: mockFrom });
  mockFrom.mockReturnValue({ where: mockWhere });
  mockWhere.mockResolvedValue(ACTIVE_ROWS);
});

describe("runAllIntegrationSyncs", () => {
  it("runs an incremental sync once per active integration", async () => {
    runIntegrationSync.mockResolvedValue({ inserted: 0 });

    const result = await runAllIntegrationSyncs();

    expect(runIntegrationSync).toHaveBeenCalledTimes(2);
    expect(runIntegrationSync).toHaveBeenNthCalledWith(1, "co-1", "stripe", {
      mode: "incremental",
    });
    expect(runIntegrationSync).toHaveBeenNthCalledWith(2, "co-2", "stripe", {
      mode: "incremental",
    });
    expect(result).toEqual({ synced: 2, failed: 0 });
  });

  it("isolates a thrown sync: the other still runs and it is counted as failed", async () => {
    runIntegrationSync
      .mockRejectedValueOnce(new Error("co-1 boom"))
      .mockResolvedValueOnce({ inserted: 3 });

    const result = await runAllIntegrationSyncs();

    // Both were attempted — the first failure did not stop the second.
    expect(runIntegrationSync).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ synced: 1, failed: 1 });
  });

  it("does not throw when the initial db.select() rejects; returns { synced: 0, failed: 0 }", async () => {
    // Simulate a DB connection error on the outer select
    mockWhere.mockRejectedValue(new Error("db connection lost"));

    // Must not throw
    await expect(runAllIntegrationSyncs()).resolves.toEqual({ synced: 0, failed: 0 });

    // No integration sync should have been attempted
    expect(runIntegrationSync).not.toHaveBeenCalled();
  });
});
