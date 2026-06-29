/**
 * competitor domain module — shape test (Task 10).
 *
 * Proves: id, non-core, exactly the two read tools, and a nav entry exist.
 * Mocks mirror company-knowledge.test.ts for transitively-imported DB deps.
 */

import { describe, it, expect, vi } from "vitest";

// ── DB stub: competitor.ts imports listChanges; ai-tools/competitor imports both ──
vi.mock("@burnless/db", () => ({
  listChanges: vi.fn(async () => []),
  listCompetitors: vi.fn(async () => []),
}));

// ── From the brief (Task 10) ──────────────────────────────────────────────────

describe("competitorDomainModule — structural", () => {
  it("is a non-core domain with id 'competitor' and the two read tools", async () => {
    const { competitorDomainModule } = await import("../competitor");
    expect(competitorDomainModule.id).toBe("competitor");
    expect(competitorDomainModule.core).toBeFalsy();
    expect(competitorDomainModule.tools.map((t) => t.name).sort()).toEqual([
      "list_competitor_changes",
      "list_competitors",
    ]);
    expect(competitorDomainModule.navEntries.length).toBeGreaterThan(0);
  });

  it("navEntries items conform to DomainNavEntry shape (id, href, label, icon as string)", async () => {
    const { competitorDomainModule } = await import("../competitor");
    for (const entry of competitorDomainModule.navEntries) {
      expect(typeof entry.id).toBe("string");
      expect(typeof entry.href).toBe("string");
      expect(typeof entry.label).toBe("string");
      expect(typeof entry.icon).toBe("string");
    }
  });

  it("has a context contributor with id 'competitor-recent-changes'", async () => {
    const { competitorDomainModule } = await import("../competitor");
    expect(
      competitorDomainModule.contextContributors.map((c) => c.id),
    ).toContain("competitor-recent-changes");
  });

  it("has no handlers in competitorDomainModule.handlers for non-existent tools", async () => {
    const { competitorDomainModule } = await import("../competitor");
    // handlers keys must be exactly the two tool names
    expect(Object.keys(competitorDomainModule.handlers).sort()).toEqual([
      "list_competitor_changes",
      "list_competitors",
    ]);
  });
});
