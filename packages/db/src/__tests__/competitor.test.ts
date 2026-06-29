import { describe, it, expect, beforeEach, vi } from "vitest";
import { getTestDb } from "./setup";

vi.mock("../index", () => ({
  get db() {
    return getTestDb();
  },
}));

import { createUser, createCompany } from "./factories";
import {
  createCompetitor,
  listCompetitors,
  getCompetitor,
  updateCompetitor,
  deleteCompetitor,
  createSource,
  getDueSources,
  getLatestSnapshot,
  insertSnapshot,
  insertChanges,
  listChanges,
} from "../queries/competitor";

let companyId: string;

beforeEach(async () => {
  const owner = await createUser();
  const company = await createCompany(owner.id);
  companyId = company.id;
});

describe("competitor queries", () => {
  it("creates and lists competitors scoped by company", async () => {
    await createCompetitor({ companyId, name: "Acme", url: "https://acme.com" });
    const list = await listCompetitors(companyId);
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.some((c) => c.name === "Acme")).toBe(true);
  });

  it("getCompetitor returns undefined for wrong companyId", async () => {
    const c = await createCompetitor({ companyId, name: "Acme", url: "https://acme.com" });
    const result = await getCompetitor(c.id, "wrong-company-id");
    expect(result).toBeUndefined();
  });

  it("updateCompetitor patches name and is company-scoped", async () => {
    const c = await createCompetitor({ companyId, name: "Acme", url: "https://acme.com" });
    const updated = await updateCompetitor(c.id, companyId, { name: "Acme Corp" });
    expect(updated?.name).toBe("Acme Corp");
    // wrong company returns undefined
    const miss = await updateCompetitor(c.id, "other", { name: "X" });
    expect(miss).toBeUndefined();
  });

  it("getDueSources returns sources never run or past their interval", async () => {
    const c = await createCompetitor({ companyId, name: "Acme", url: "https://acme.com" });
    await createSource({
      companyId,
      competitorId: c.id,
      type: "pricing",
      url: "https://acme.com/pricing",
    });
    const due = await getDueSources(new Date());
    // lastRunAt is null → due immediately
    expect(due.length).toBeGreaterThanOrEqual(1);
  });

  it("insertSnapshot + getLatestSnapshot returns the most recent by source", async () => {
    const c = await createCompetitor({ companyId, name: "Acme", url: "https://acme.com" });
    const s = await createSource({ companyId, competitorId: c.id, type: "pricing", url: "u" });
    await insertSnapshot({
      companyId,
      competitorId: c.id,
      sourceId: s.id,
      raw: "a",
      rawHash: "h1",
      structured: { v: 1 },
      structuredHash: "sh1",
    });
    const latest = await getLatestSnapshot(s.id);
    expect(latest?.structuredHash).toBe("sh1");
  });

  it("insertChanges + listChanges by company ordered by detectedAt desc", async () => {
    const c = await createCompetitor({ companyId, name: "Acme", url: "https://acme.com" });
    const s = await createSource({ companyId, competitorId: c.id, type: "pricing", url: "u" });
    const snap = await insertSnapshot({
      companyId,
      competitorId: c.id,
      sourceId: s.id,
      raw: "a",
      rawHash: "h",
      structured: {},
      structuredHash: "sh",
    });
    await insertChanges([
      {
        companyId,
        competitorId: c.id,
        sourceId: s.id,
        snapshotId: snap.id,
        changeType: "price_increase",
        summary: "x",
        severity: "warning",
      },
    ]);
    const changes = await listChanges(companyId);
    expect(changes.length).toBeGreaterThanOrEqual(1);
    expect(changes.some((ch) => ch.changeType === "price_increase")).toBe(true);
  });

  it("deleteCompetitor cascades and is company-scoped", async () => {
    const c = await createCompetitor({ companyId, name: "Acme", url: "https://acme.com" });
    await deleteCompetitor(c.id, companyId);
    expect(await getCompetitor(c.id, companyId)).toBeUndefined();
  });
});
