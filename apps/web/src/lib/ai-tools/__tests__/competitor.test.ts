/**
 * Tests for the competitor read-only AI toolset (Task 9):
 * list_competitors + list_competitor_changes.
 *
 * HARNESS: real PGLite via @db-test — mirrors transactions.test.ts wiring.
 * The DB is real; only framework seams pulled by the import graph are mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createUser, createCompany } from "@db-test/factories";
import { createCompetitor, insertChanges } from "@burnless/db";
import type { ToolContext } from "../types";

// ── Framework seam mocks ──────────────────────────────────────────────────────
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: (fn: unknown) => fn };
});
vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue(null),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => undefined }),
}));

import { competitorHandlers, competitorTools } from "../competitor";

// ── Setup ─────────────────────────────────────────────────────────────────────

let ctx: ToolContext;
let companyId: string;

beforeEach(async () => {
  const user = await createUser();
  const company = await createCompany(user.id);
  companyId = company.id;
  ctx = { companyId, userId: user.id };
});

// ── Tool definition guard ─────────────────────────────────────────────────────

describe("competitorTools definitions", () => {
  it("declares two read-only tools (no mutates)", () => {
    const names = competitorTools.map((t) => t.name).sort();
    expect(names).toEqual(["list_competitor_changes", "list_competitors"]);
    expect(competitorTools.every((t) => !t.mutates)).toBe(true);
  });
});

// ── list_competitors ──────────────────────────────────────────────────────────

describe("list_competitors", () => {
  it("returns a friendly message when no competitors tracked", async () => {
    const out = await competitorHandlers["list_competitors"]!({}, ctx);
    expect(out).toMatch(/no competitors/i);
  });

  it("returns the company's competitors as text", async () => {
    await createCompetitor({ companyId, name: "Acme", url: "https://acme.com" });
    const out = await competitorHandlers["list_competitors"]!({}, ctx);
    expect(out).toContain("Acme");
    expect(out).toContain("https://acme.com");
  });

  it("returns 'No company in context.' when companyId is missing", async () => {
    const noCtx: ToolContext = { userId: "u1" };
    const out = await competitorHandlers["list_competitors"]!({}, noCtx);
    expect(out).toBe("No company in context.");
  });

  it("does not leak competitors from another company", async () => {
    const other = await createUser();
    const otherCompany = await createCompany(other.id);
    await createCompetitor({ companyId: otherCompany.id, name: "OtherCo", url: "https://other.com" });
    const out = await competitorHandlers["list_competitors"]!({}, ctx);
    expect(out).not.toContain("OtherCo");
  });
});

// ── list_competitor_changes ───────────────────────────────────────────────────

describe("list_competitor_changes", () => {
  it("returns a friendly message when no changes detected", async () => {
    const out = await competitorHandlers["list_competitor_changes"]!({}, ctx);
    expect(out).toMatch(/no competitor changes/i);
  });

  it("returns changes for the company", async () => {
    // Create a competitor + source + snapshot + change via insertChanges
    const { getTestDb } = await import("@db-test/setup");
    const db = getTestDb();
    const { competitorSources, competitorSnapshots } = await import("@burnless/db");

    const comp = await createCompetitor({ companyId, name: "Rival", url: "https://rival.com" });

    // Insert a source directly
    const [src] = await db
      .insert(competitorSources)
      .values({
        competitorId: comp.id,
        companyId,
        type: "pricing",
        url: "https://rival.com/pricing",
      })
      .returning();

    // Insert a snapshot
    const [snap] = await db
      .insert(competitorSnapshots)
      .values({
        competitorId: comp.id,
        sourceId: src!.id,
        companyId,
        raw: "{}",
        rawHash: "abc",
        structured: {},
        structuredHash: "def",
      })
      .returning();

    await insertChanges([
      {
        competitorId: comp.id,
        sourceId: src!.id,
        snapshotId: snap!.id,
        companyId,
        changeType: "price_change",
        summary: "Starter plan dropped from $49 to $39",
        severity: "high",
      },
    ]);

    const out = await competitorHandlers["list_competitor_changes"]!({}, ctx);
    expect(out).toContain("price_change");
    expect(out).toContain("Starter plan dropped");
    expect(out).toContain("high");
  });

  it("respects the limit parameter", async () => {
    const out = await competitorHandlers["list_competitor_changes"]!({ limit: 5 }, ctx);
    // No changes → friendly message (also proves limit doesn't crash)
    expect(out).toMatch(/no competitor changes/i);
  });

  it("returns 'No company in context.' when companyId is missing", async () => {
    const noCtx: ToolContext = { userId: "u1" };
    const out = await competitorHandlers["list_competitor_changes"]!({}, noCtx);
    expect(out).toBe("No company in context.");
  });
});
