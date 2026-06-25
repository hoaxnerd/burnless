import { describe, it, expect, vi } from "vitest";
import { getTestDb } from "../../__tests__/setup";

vi.mock("../../index", () => ({ get db() { return getTestDb(); } }));

import { eq } from "drizzle-orm";
import { createCompanyContext } from "../../__tests__/factories";
import { companies } from "../../schema";
import { insertMemory, listMemory, deleteMemoryById } from "../memory";

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
});
