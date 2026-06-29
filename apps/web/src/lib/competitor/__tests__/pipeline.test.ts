/**
 * Integration test for the competitor sync pipeline.
 *
 * DB WIRING: imports @db-test factories → vitest.config.mts `needsDb()` detects
 * this file as a "db" test → vitest.setup.db.ts runs first and assigns
 * globalThis.__burnless_db to a fresh PGlite instance BEFORE @burnless/db
 * evaluates. When pipeline.ts (and its @burnless/db imports) are loaded, they
 * pick up the in-memory PGlite. The @burnless/db barrel is NOT mocked.
 *
 * COLLECTOR MOCK: vi.mock("../collectors") stubs getCollector so no network
 * calls happen. The stub's parse() reads globalThis.__next at call-time so
 * tests can change the structured payload between runs.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createUser, createCompany, createMember } from "@db-test/factories";
import {
  createCompetitor,
  createSource,
  getLatestSnapshot,
  listChanges,
} from "@burnless/db";

// Stub the collector registry so no network calls happen.
// parse() reads globalThis.__next at call-time — set it before each runSource call.
vi.mock("../collectors", async (orig) => {
  const actual = await (orig as () => Promise<Record<string, unknown>>)();
  return {
    ...actual,
    getCollector: () => ({
      type: "pricing",
      fetch: async () => ({
        contentType: "text/html",
        raw: "<html/>",
        fetchedAt: new Date(),
        status: 200,
      }),
      parse: () => ({
        structured: (globalThis as Record<string, unknown>).__next,
        confidence: 0.9,
      }),
    }),
  };
});

// Import AFTER the mock declaration so vitest hoisting applies.
import { runSource } from "../pipeline";

const PRICE_29 = {
  plans: [
    {
      name: "Pro",
      price: { amount: 29, currency: "USD", period: "month" },
      features: [],
    },
  ],
};

const PRICE_39 = {
  plans: [
    {
      name: "Pro",
      price: { amount: 39, currency: "USD", period: "month" },
      features: [],
    },
  ],
};

describe("competitor sync pipeline", () => {
  let companyId: string;
  let sourceRow: Awaited<ReturnType<typeof createSource>>;

  beforeEach(async () => {
    const user = await createUser();
    const company = await createCompany(user.id);
    // createMember defaults to role:"owner" → getCompanyNotifyUserIds returns this userId
    await createMember(company.id, user.id);
    companyId = company.id;

    const competitor = await createCompetitor({
      companyId,
      name: "Acme",
      url: "https://acme.com",
    });
    sourceRow = await createSource({
      companyId,
      competitorId: competitor.id,
      type: "pricing",
      url: "https://acme.com/pricing",
    });
  });

  it("first run stores a snapshot and returns changed:true", async () => {
    (globalThis as Record<string, unknown>).__next = PRICE_29;

    const result = await runSource(sourceRow);

    expect(result.changed).toBe(true);
    expect(result.broken).toBe(false);

    const snap = await getLatestSnapshot(sourceRow.id);
    expect(snap).toBeTruthy();
    expect(snap!.structuredHash).toBeTruthy();
  });

  it("unchanged re-run creates NO new snapshot (store-on-change guard)", async () => {
    (globalThis as Record<string, unknown>).__next = PRICE_29;

    // First run — stores snapshot
    await runSource(sourceRow);
    const snapAfterFirst = await getLatestSnapshot(sourceRow.id);

    // Second run — same data, must not create another snapshot
    const result = await runSource(sourceRow);
    expect(result.changed).toBe(false);
    expect(result.broken).toBe(false);

    const snapAfterSecond = await getLatestSnapshot(sourceRow.id);
    // Still the same snapshot row
    expect(snapAfterSecond!.id).toBe(snapAfterFirst!.id);
  });

  it("changed price stores a new snapshot and emits a price_increase change row", async () => {
    // Run 1: establish baseline at price 29
    (globalThis as Record<string, unknown>).__next = PRICE_29;
    await runSource(sourceRow);

    // Run 2: price bumped to 39 — should diff and emit price_increase
    (globalThis as Record<string, unknown>).__next = PRICE_39;
    const result = await runSource(sourceRow);

    expect(result.changed).toBe(true);
    expect(result.broken).toBe(false);
    expect(result.alerts.length).toBeGreaterThan(0);
    expect(result.alerts.some((a) => a.changeType === "price_increase")).toBe(true);

    const changes = await listChanges(companyId);
    expect(changes.length).toBeGreaterThan(0);
    expect(changes.some((c) => c.changeType === "price_increase")).toBe(true);
  });
});
