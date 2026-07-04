/**
 * Integration test for the reframed competitor sync pipeline (spec §5).
 *
 * DB WIRING: imports @db-test factories → vitest.config.mts `needsDb()` detects
 * this file as a "db" test → vitest.setup.db.ts runs first and assigns
 * globalThis.__burnless_db to a fresh PGlite instance BEFORE @burnless/db
 * evaluates. When pipeline.ts (and its @burnless/db imports) are loaded, they
 * pick up the in-memory PGlite. The @burnless/db barrel is NOT mocked.
 *
 * NETWORK: we do NOT mock ../collectors — the REAL collectors + real
 * `normalizeHtml`/parse run. Both the structured collectors and the `page`
 * fallback fetch through `httpFetch`, which calls `global.fetch`. We stub
 * `global.fetch` with a sequenced-HTML helper so runs return controlled pages
 * (nonce churn, visible changes, confident pricing) with zero network I/O.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createUser, createCompany, createMember } from "@db-test/factories";
import {
  db,
  sha256hex,
  competitorSnapshots,
  createCompetitor,
  createSource,
  getLatestSnapshot,
  listChanges,
} from "@burnless/db";

// Import the real pipeline (collectors are real, only global.fetch is stubbed).
import { runSource } from "../pipeline";

/** Stub global.fetch to return each HTML page in turn (last page repeats). */
function stubFetchSequence(pages: string[]): void {
  let i = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const raw = pages[Math.min(i, pages.length - 1)] ?? "";
      i += 1;
      return {
        status: 200,
        headers: { get: () => "text/html" },
        text: async () => raw,
      } as unknown as Response;
    }),
  );
}

/** Count stored snapshots for a source (store-on-change assertions). */
async function countSnapshots(sourceId: string): Promise<number> {
  const rows = await db
    .select()
    .from(competitorSnapshots)
    .where(eq(competitorSnapshots.sourceId, sourceId));
  return rows.length;
}

/** HTML the pricing collector parses confidently (JSON-LD Product + visible price). */
function pricingHtml(amount: number): string {
  const ld = JSON.stringify({
    "@type": "Product",
    name: "Pro",
    offers: { price: amount, priceCurrency: "USD" },
  });
  return `<html><body><script type="application/ld+json">${ld}</script><main><ul><li>Pro $${amount}/mo</li></ul></main></body></html>`;
}

describe("competitor sync pipeline", () => {
  let companyId: string;
  let competitorId: string;
  let sourceRow: Awaited<ReturnType<typeof createSource>>;
  let pageSource: Awaited<ReturnType<typeof createSource>>;

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
    competitorId = competitor.id;

    sourceRow = await createSource({
      companyId,
      competitorId: competitor.id,
      type: "pricing",
      url: "https://acme.com/pricing",
    });
    // A `page`-type source has NO collector → Tier 1 (content diff) only.
    pageSource = await createSource({
      companyId,
      competitorId: competitor.id,
      type: "page",
      url: "https://acme.com/features",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("first run stores a snapshot and returns changed:true", async () => {
    stubFetchSequence([pricingHtml(29)]);

    const result = await runSource(sourceRow);

    expect(result.changed).toBe(true);
    expect(result.broken).toBe(false);

    const snap = await getLatestSnapshot(sourceRow.id);
    expect(snap).toBeTruthy();
    expect(snap!.structuredHash).toBeTruthy();
    expect(snap!.normalizedHash).toBeTruthy();
  });

  it("unchanged re-run creates NO new snapshot (store-on-change guard)", async () => {
    stubFetchSequence([pricingHtml(29), pricingHtml(29)]);

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
    expect(await countSnapshots(sourceRow.id)).toBe(1);
  });

  it("changed price stores a new snapshot and emits a price_increase change row", async () => {
    stubFetchSequence([pricingHtml(29), pricingHtml(39)]);

    // Run 1: establish baseline at price 29
    await runSource(sourceRow);

    // Run 2: price bumped to 39 — should diff and emit price_increase
    const result = await runSource(sourceRow);

    expect(result.changed).toBe(true);
    expect(result.broken).toBe(false);
    expect(result.alerts.length).toBeGreaterThan(0);
    expect(result.alerts.some((a) => a.changeType === "price_increase")).toBe(true);

    const changes = await listChanges(companyId);
    expect(changes.length).toBeGreaterThan(0);
    expect(changes.some((c) => c.changeType === "price_increase")).toBe(true);
  });

  it("does NOT store a new snapshot when only a nonce changed (normalized content identical)", async () => {
    // Identical VISIBLE text, rotated nonce attribute between the two fetches.
    const pageA = `<html><body><nonce data-n="aaaa"></nonce><ul><li>Pro $29</li></ul></body></html>`;
    const pageB = `<html><body><nonce data-n="zzzz"></nonce><ul><li>Pro $29</li></ul></body></html>`;
    stubFetchSequence([pageA, pageB]);

    await runSource(sourceRow); // first run stores baseline
    const before = await countSnapshots(sourceRow.id);
    const r = await runSource(sourceRow); // second run: nonce-only churn
    const after = await countSnapshots(sourceRow.id);

    expect(after).toBe(before);
    expect(r.changed).toBe(false);
    expect(r.broken).toBe(false);
  });

  it("re-baselines silently when the prior snapshot has NULL normalized (legacy row)", async () => {
    // Seed a legacy snapshot (pre-reframe migration): normalized == null.
    // Insert directly — insertSnapshot() now requires normalized as a string.
    await db.insert(competitorSnapshots).values({
      companyId,
      competitorId,
      sourceId: pageSource.id,
      raw: "<html><body><main>Old content</main></body></html>",
      rawHash: sha256hex("<html><body><main>Old content</main></body></html>"),
      structured: {},
      structuredHash: sha256hex(JSON.stringify({})),
      normalized: null,
      normalizedHash: null,
    });

    stubFetchSequence([`<html><body><main>Fresh content — SSO</main></body></html>`]);
    const r = await runSource(pageSource);

    // The new snapshot IS stored (re-baseline), but NO content_changed alert fires.
    expect(r.changed).toBe(true);
    expect(r.broken).toBe(false);
    expect(await countSnapshots(pageSource.id)).toBe(2);

    const changes = await listChanges(companyId, { competitorId });
    expect(changes.some((c) => c.changeType === "content_changed")).toBe(false);
  });

  it("emits ONE content change on a real visible change (page source, no structured parse)", async () => {
    const pageA = `<html><body><main>Welcome</main></body></html>`;
    const pageB = `<html><body><main>Welcome — now with SSO</main></body></html>`;
    stubFetchSequence([pageA, pageB]);

    await runSource(pageSource); // a source of type "page" (no collector)
    const r = await runSource(pageSource);

    expect(r.changed).toBe(true);
    expect(r.broken).toBe(false);

    const changes = await listChanges(companyId, { competitorId });
    const content = changes.filter((c) => c.changeType === "content_changed");
    expect(content).toHaveLength(1);
    expect(content[0]!.severity).toBe("info");
    // no typed pricing/social change on a page source
    expect(changes.every((c) => c.changeType === "content_changed")).toBe(true);
  });

  it("emits BOTH a content change and a typed price change when pricing parse is confident", async () => {
    stubFetchSequence([pricingHtml(29), pricingHtml(39)]);

    await runSource(sourceRow);
    const r = await runSource(sourceRow);

    const changes = await listChanges(companyId, { competitorId });
    expect(changes.some((c) => c.changeType === "content_changed")).toBe(true);
    expect(changes.some((c) => c.changeType === "price_increase")).toBe(true);
    expect(r.changed).toBe(true);
  });
});
