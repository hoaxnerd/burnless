import { describe, it, expect, vi } from "vitest";
import { getTestDb } from "../../__tests__/setup";

vi.mock("../../index", () => ({ get db() { return getTestDb(); } }));

import { eq } from "drizzle-orm";
import { createCompanyContext } from "../../__tests__/factories";
import { companies } from "../../schema";
import { insertMemory, listMemory, deleteMemoryById, searchMemoryByEmbedding, hasRecallMemory } from "../memory";

/** A 1536-dim unit vector with a single 1.0 at `hot`, the rest 0. */
function unitVec(hot: number): number[] {
  const v = new Array(1536).fill(0);
  v[hot] = 1;
  return v;
}

describe("memory query helpers", () => {
  it("insertMemory persists a block-tier company fact with null embedding + sane defaults", async () => {
    const ctx = await createCompanyContext();
    const row = await insertMemory({
      companyId: ctx.company.id,
      userId: ctx.user.id,
      domain: "company-knowledge",
      kind: "company_fact",
      tier: "block",
      label: "HQ",
      content: "Headquartered in Berlin.",
    });
    expect(row.id).toBeTruthy();
    expect(row.companyId).toBe(ctx.company.id);
    expect(row.userId).toBe(ctx.user.id);
    expect(row.domain).toBe("company-knowledge");
    expect(row.kind).toBe("company_fact");
    expect(row.tier).toBe("block");
    expect(row.label).toBe("HQ");
    expect(row.content).toBe("Headquartered in Berlin.");
    expect(row.embedding).toBeNull();
    expect(row.metadata).toBeNull();
    expect(row.readOnly).toBe(false);
    expect(row.expiresAt).toBeNull();
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.updatedAt).toBeInstanceOf(Date);
  });

  it("listMemory filters by company/domain/kind/tier, newest-first, no cross-company leak", async () => {
    const a = await createCompanyContext();
    const other = await createCompanyContext();

    await insertMemory({
      companyId: a.company.id,
      userId: a.user.id,
      domain: "company-knowledge",
      kind: "company_fact",
      tier: "block",
      content: "first fact",
    });
    await new Promise((r) => setTimeout(r, 5)); // distinct createdAt for deterministic order
    await insertMemory({
      companyId: a.company.id,
      userId: a.user.id,
      domain: "company-knowledge",
      kind: "company_fact",
      tier: "block",
      content: "second fact",
    });
    // Same company, different (domain,kind,tier) — must be excluded by the filter.
    await insertMemory({
      companyId: a.company.id,
      userId: a.user.id,
      domain: "finance",
      kind: "note",
      tier: "recall",
      content: "other-domain note",
    });
    // Different company — must never leak.
    await insertMemory({
      companyId: other.company.id,
      userId: other.user.id,
      domain: "company-knowledge",
      kind: "company_fact",
      tier: "block",
      content: "elsewhere fact",
    });

    const list = await listMemory({
      companyId: a.company.id,
      domain: "company-knowledge",
      kind: "company_fact",
      tier: "block",
    });
    expect(list.map((m) => m.content)).toEqual(["second fact", "first fact"]); // newest first
    expect(list.some((m) => m.content === "other-domain note")).toBe(false);
    expect(list.some((m) => m.content === "elsewhere fact")).toBe(false);
  });

  it("deleteMemoryById is tenancy-safe: wrong company is a no-op, owning company deletes", async () => {
    const a = await createCompanyContext();
    const other = await createCompanyContext();
    const row = await insertMemory({
      companyId: a.company.id,
      userId: a.user.id,
      domain: "company-knowledge",
      kind: "company_fact",
      tier: "block",
      content: "to delete",
    });

    // Wrong company: returns null and does NOT delete.
    const wrong = await deleteMemoryById(row.id, other.company.id);
    expect(wrong).toBeNull();
    const stillThere = await listMemory({ companyId: a.company.id });
    expect(stillThere.map((m) => m.id)).toContain(row.id);

    // Owning company: returns the row and deletes it.
    const deleted = await deleteMemoryById(row.id, a.company.id);
    expect(deleted).not.toBeNull();
    expect(deleted!.id).toBe(row.id);
    const after = await listMemory({ companyId: a.company.id });
    expect(after.map((m) => m.id)).not.toContain(row.id);
  });

  it("FK onDelete cascade: deleting the company removes its memory rows", async () => {
    const db = getTestDb();
    const ctx = await createCompanyContext();
    await insertMemory({
      companyId: ctx.company.id,
      userId: ctx.user.id,
      domain: "company-knowledge",
      kind: "company_fact",
      tier: "block",
      content: "cascade me",
    });
    expect((await listMemory({ companyId: ctx.company.id })).length).toBe(1);

    await db.delete(companies).where(eq(companies.id, ctx.company.id));

    expect((await listMemory({ companyId: ctx.company.id })).length).toBe(0);
  });

  it("userId is nullable: insertMemory without userId persists userId === null", async () => {
    const ctx = await createCompanyContext();
    const row = await insertMemory({
      companyId: ctx.company.id,
      domain: "company-knowledge",
      kind: "company_fact",
      tier: "block",
      content: "no user",
    });
    expect(row.userId).toBeNull();
  });

  describe("hasRecallMemory", () => {
    it("is true when a recall row exists, false with only block rows or for another company", async () => {
      const a = await createCompanyContext();
      const other = await createCompanyContext();

      // `other` has only a block row + `a` has a block row → neither counts as recall.
      await insertMemory({
        companyId: a.company.id,
        domain: "company-knowledge",
        kind: "company_fact",
        tier: "block",
        content: "block fact",
      });
      await insertMemory({
        companyId: other.company.id,
        domain: "finance",
        kind: "note",
        tier: "recall",
        content: "other-company recall",
        embedding: unitVec(0),
      });

      // `a` has no recall yet (block only); `other`'s recall must not leak.
      expect(await hasRecallMemory(a.company.id)).toBe(false);

      // Add a recall row to `a` → now true.
      await insertMemory({
        companyId: a.company.id,
        domain: "finance",
        kind: "note",
        tier: "recall",
        content: "a recall",
        embedding: unitVec(1),
      });
      expect(await hasRecallMemory(a.company.id)).toBe(true);
    });
  });

  describe("searchMemoryByEmbedding", () => {
    it("returns the closest recall rows in ascending-distance order, excludes null-embedding + other companies", async () => {
      const a = await createCompanyContext();
      const other = await createCompanyContext();

      // Recall rows with distinct 1536-dim unit vectors.
      const near = await insertMemory({
        companyId: a.company.id,
        domain: "finance",
        kind: "note",
        tier: "recall",
        content: "near",
        embedding: unitVec(0),
      });
      const mid = await insertMemory({
        companyId: a.company.id,
        domain: "finance",
        kind: "note",
        tier: "recall",
        content: "mid",
        embedding: unitVec(1),
      });
      // A third recall row whose vector is a 50/50 blend of dims 0 and 1, so it
      // sits between `near` and `mid` for a query aligned with dim 0.
      const blend = new Array(1536).fill(0);
      blend[0] = 1;
      blend[1] = 1;
      await insertMemory({
        companyId: a.company.id,
        domain: "finance",
        kind: "note",
        tier: "recall",
        content: "blend",
        embedding: blend,
      });
      // Block-tier row with NULL embedding — must be excluded.
      await insertMemory({
        companyId: a.company.id,
        domain: "finance",
        kind: "note",
        tier: "block",
        content: "block-fact",
      });
      // Other company's recall row — must never leak.
      await insertMemory({
        companyId: other.company.id,
        domain: "finance",
        kind: "note",
        tier: "recall",
        content: "elsewhere",
        embedding: unitVec(0),
      });

      // Query aligned exactly with `near` (dim 0).
      const results = await searchMemoryByEmbedding(a.company.id, unitVec(0), { topK: 2 });

      expect(results).toHaveLength(2);
      // Closest first: `near` (distance 0) then `blend` (closer than `mid`).
      expect(results.map((r) => r.content)).toEqual([near.content, "blend"]);
      // Ascending distance.
      expect(results[0]!.distance).toBeLessThanOrEqual(results[1]!.distance);
      expect(typeof results[0]!.distance).toBe("number");
      expect(results[0]!.distance).toBeCloseTo(0, 5);
      // The null-embedding block row and other-company row are absent.
      expect(results.some((r) => r.content === "block-fact")).toBe(false);
      expect(results.some((r) => r.content === "elsewhere")).toBe(false);
      // `mid` is excluded by topK=2 (it's farther than `blend`).
      expect(results.some((r) => r.content === mid.content)).toBe(false);
    });

    it("narrows by domain/kind and defaults topK to 5", async () => {
      const ctx = await createCompanyContext();
      await insertMemory({
        companyId: ctx.company.id,
        domain: "finance",
        kind: "note",
        tier: "recall",
        content: "finance-note",
        embedding: unitVec(0),
      });
      await insertMemory({
        companyId: ctx.company.id,
        domain: "people",
        kind: "note",
        tier: "recall",
        content: "people-note",
        embedding: unitVec(0),
      });

      const onlyFinance = await searchMemoryByEmbedding(ctx.company.id, unitVec(0), {
        domain: "finance",
      });
      expect(onlyFinance.map((r) => r.content)).toEqual(["finance-note"]);

      const all = await searchMemoryByEmbedding(ctx.company.id, unitVec(0));
      expect(all.map((r) => r.content).sort()).toEqual(["finance-note", "people-note"]);
    });
  });
});
