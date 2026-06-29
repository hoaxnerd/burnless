import { and, desc, eq } from "drizzle-orm";
import { db } from "../index";
import {
  competitors,
  competitorSources,
  competitorSnapshots,
  competitorChanges,
  type Competitor,
  type CompetitorSource,
  type CompetitorSnapshot,
  type CompetitorChange,
} from "../schema/competitor";

// ── Competitors ───────────────────────────────────────────────────────────────

export async function createCompetitor(input: {
  companyId: string;
  name: string;
  url: string;
  status?: string;
}): Promise<Competitor> {
  const [row] = await db.insert(competitors).values(input).returning();
  return row!;
}

export async function listCompetitors(companyId: string): Promise<Competitor[]> {
  return db
    .select()
    .from(competitors)
    .where(eq(competitors.companyId, companyId))
    .orderBy(desc(competitors.createdAt));
}

export async function getCompetitor(
  id: string,
  companyId: string,
): Promise<Competitor | undefined> {
  const [row] = await db
    .select()
    .from(competitors)
    .where(and(eq(competitors.id, id), eq(competitors.companyId, companyId)));
  return row;
}

export async function updateCompetitor(
  id: string,
  companyId: string,
  patch: Partial<Pick<Competitor, "name" | "url" | "status">>,
): Promise<Competitor | undefined> {
  const [row] = await db
    .update(competitors)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(competitors.id, id), eq(competitors.companyId, companyId)))
    .returning();
  return row;
}

export async function deleteCompetitor(id: string, companyId: string): Promise<void> {
  await db
    .delete(competitors)
    .where(and(eq(competitors.id, id), eq(competitors.companyId, companyId)));
}

// ── Competitor Sources ────────────────────────────────────────────────────────

export async function createSource(input: {
  companyId: string;
  competitorId: string;
  type: string;
  url: string;
  config?: unknown;
  intervalHours?: number;
}): Promise<CompetitorSource> {
  const [row] = await db
    .insert(competitorSources)
    .values(input as typeof competitorSources.$inferInsert)
    .returning();
  return row!;
}

export async function listSources(
  competitorId: string,
  companyId: string,
): Promise<CompetitorSource[]> {
  return db
    .select()
    .from(competitorSources)
    .where(
      and(
        eq(competitorSources.competitorId, competitorId),
        eq(competitorSources.companyId, companyId),
      ),
    );
}

export async function updateSource(
  id: string,
  companyId: string,
  patch: Partial<typeof competitorSources.$inferInsert>,
): Promise<CompetitorSource | undefined> {
  const [row] = await db
    .update(competitorSources)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(competitorSources.id, id), eq(competitorSources.companyId, companyId)))
    .returning();
  return row;
}

export async function deleteSource(id: string, companyId: string): Promise<void> {
  await db
    .delete(competitorSources)
    .where(and(eq(competitorSources.id, id), eq(competitorSources.companyId, companyId)));
}

/**
 * Sources that are enabled and due to run:
 *   - never run (lastRunAt IS NULL), OR
 *   - lastRunAt + intervalHours hours <= now
 *
 * Uses a JS-side filter for PGlite compatibility (interval arithmetic in WHERE
 * can behave inconsistently across PGlite versions). Correct for the expected
 * scale of competitor sources (typically tens of rows, never thousands).
 */
export async function getDueSources(now: Date, limit = 200): Promise<CompetitorSource[]> {
  const rows = await db
    .select()
    .from(competitorSources)
    .where(eq(competitorSources.enabled, true));

  return rows
    .filter(
      (r) =>
        r.lastRunAt == null ||
        r.lastRunAt.getTime() + r.intervalHours * 3_600_000 <= now.getTime(),
    )
    .slice(0, limit);
}

// ── Competitor Snapshots ──────────────────────────────────────────────────────

export async function getLatestSnapshot(
  sourceId: string,
): Promise<CompetitorSnapshot | undefined> {
  const [row] = await db
    .select()
    .from(competitorSnapshots)
    .where(eq(competitorSnapshots.sourceId, sourceId))
    .orderBy(desc(competitorSnapshots.capturedAt))
    .limit(1);
  return row;
}

export async function insertSnapshot(input: {
  companyId: string;
  competitorId: string;
  sourceId: string;
  raw: string;
  rawHash: string;
  structured: unknown;
  structuredHash: string;
}): Promise<CompetitorSnapshot> {
  const [row] = await db
    .insert(competitorSnapshots)
    .values(input as typeof competitorSnapshots.$inferInsert)
    .returning();
  return row!;
}

// ── Competitor Changes ────────────────────────────────────────────────────────

export async function insertChanges(
  rows: Array<Omit<typeof competitorChanges.$inferInsert, "id" | "detectedAt" | "createdAt">>,
): Promise<void> {
  if (rows.length === 0) return;
  await db
    .insert(competitorChanges)
    .values(rows as typeof competitorChanges.$inferInsert[]);
}

export async function listChanges(
  companyId: string,
  opts?: { competitorId?: string; limit?: number },
): Promise<CompetitorChange[]> {
  const conds: ReturnType<typeof eq>[] = [eq(competitorChanges.companyId, companyId)];
  if (opts?.competitorId) {
    conds.push(eq(competitorChanges.competitorId, opts.competitorId));
  }
  return db
    .select()
    .from(competitorChanges)
    .where(conds.length === 1 ? conds[0] : and(...conds))
    .orderBy(desc(competitorChanges.detectedAt))
    .limit(opts?.limit ?? 100);
}

export async function ackChange(id: string, companyId: string, at: Date): Promise<void> {
  await db
    .update(competitorChanges)
    .set({ acknowledgedAt: at })
    .where(and(eq(competitorChanges.id, id), eq(competitorChanges.companyId, companyId)));
}
