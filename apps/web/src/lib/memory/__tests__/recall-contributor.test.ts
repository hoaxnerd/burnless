/**
 * recall-contributor (A5-3) — self-gating + cost-guard tests.
 *
 * The contributor must contribute NOTHING and add ZERO embedding cost in
 * production (recall-tier empty). We mock the three gates it consults:
 *   - getCapabilities().semanticSearch       (@/lib/capabilities)
 *   - MemoryStore.searchable / .search       (./memory-store)
 *   - hasRecallMemory                        (@burnless/db)
 * and assert the exact short-circuit order (no search/embedding past a failed gate).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Capability flag (hoisted) ─────────────────────────────────────────────────
const caps = { semanticSearch: true };
vi.mock("@/lib/capabilities", () => ({
  getCapabilities: vi.fn(() => caps),
}));

// ── hasRecallMemory cost-guard (hoisted) ──────────────────────────────────────
const hasRecallMemoryMock = vi.fn(async () => true);
vi.mock("@burnless/db", () => ({
  hasRecallMemory: (...args: unknown[]) => hasRecallMemoryMock(...(args as [])),
}));

// ── MemoryStore stub (hoisted) ────────────────────────────────────────────────
let storeSearchable = true;
const searchMock = vi.fn(async () => [] as Array<{ content: string }>);
vi.mock("../memory-store", () => ({
  MemoryStore: vi.fn().mockImplementation(() => ({
    get searchable() {
      return storeSearchable;
    },
    search: (...args: unknown[]) => searchMock(...(args as [])),
  })),
}));

const CTX = { companyId: "c1" };

beforeEach(() => {
  caps.semanticSearch = true;
  storeSearchable = true;
  hasRecallMemoryMock.mockReset();
  hasRecallMemoryMock.mockResolvedValue(true);
  searchMock.mockReset();
  searchMock.mockResolvedValue([]);
});

describe("recallContributor.sections()", () => {
  it("1. semanticSearch OFF → [] without touching hasRecallMemory or search", async () => {
    caps.semanticSearch = false;
    const { recallContributor } = await import("../recall-contributor");
    expect(await recallContributor.sections(CTX)).toEqual([]);
    expect(hasRecallMemoryMock).not.toHaveBeenCalled();
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("2. ON but not searchable → [] without hasRecallMemory or search", async () => {
    storeSearchable = false;
    const { recallContributor } = await import("../recall-contributor");
    expect(await recallContributor.sections(CTX)).toEqual([]);
    expect(hasRecallMemoryMock).not.toHaveBeenCalled();
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("3. ON + searchable + hasRecallMemory=false → [] WITHOUT embedding/search", async () => {
    hasRecallMemoryMock.mockResolvedValueOnce(false);
    const { recallContributor } = await import("../recall-contributor");
    expect(await recallContributor.sections(CTX)).toEqual([]);
    expect(hasRecallMemoryMock).toHaveBeenCalledWith("c1");
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("4. ON + searchable + hasRecall + 2 hits → one section bulleting both, order 20", async () => {
    searchMock.mockResolvedValueOnce([
      { content: "Founder prefers conservative forecasts." },
      { content: "Churn spiked in Q3." },
    ]);
    const { recallContributor } = await import("../recall-contributor");
    const sections = await recallContributor.sections(CTX);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.heading).toBe("Relevant context from memory");
    expect(sections[0]!.order).toBe(20);
    expect(sections[0]!.body).toBe(
      "- Founder prefers conservative forecasts.\n- Churn spiked in Q3.",
    );
    expect(searchMock).toHaveBeenCalledTimes(1);
  });

  it("5. ON + searchable + hasRecall + search returns [] → []", async () => {
    searchMock.mockResolvedValueOnce([]);
    const { recallContributor } = await import("../recall-contributor");
    expect(await recallContributor.sections(CTX)).toEqual([]);
  });

  it("6a. search THROWS → [] (graceful)", async () => {
    searchMock.mockRejectedValueOnce(new Error("embed down"));
    const { recallContributor } = await import("../recall-contributor");
    expect(await recallContributor.sections(CTX)).toEqual([]);
  });

  it("6b. hasRecallMemory THROWS → [] (graceful)", async () => {
    hasRecallMemoryMock.mockRejectedValueOnce(new Error("db down"));
    const { recallContributor } = await import("../recall-contributor");
    expect(await recallContributor.sections(CTX)).toEqual([]);
    expect(searchMock).not.toHaveBeenCalled();
  });
});

describe("memoryDomainModule (A5-3 registration)", () => {
  it("is a core module with the recall contributor and no tools", async () => {
    const { memoryDomainModule } = await import("../../domains/memory");
    const { recallContributor } = await import("../recall-contributor");
    expect(memoryDomainModule.id).toBe("memory");
    expect(memoryDomainModule.core).toBe(true);
    expect(memoryDomainModule.tools).toEqual([]);
    expect(memoryDomainModule.contextContributors).toEqual([recallContributor]);
    expect(memoryDomainModule.promptSections).toEqual([]);
    expect(memoryDomainModule.navEntries).toEqual([]);
  });
});
