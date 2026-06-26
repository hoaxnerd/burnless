import { and, eq } from "drizzle-orm";
import { db, integrations, getDecryptedIntegrationSecret } from "@burnless/db";
import { integrationRegistry, registerConnectors } from "./registry";
import { buildAccountResolver } from "./accounts";
import { ingestRecords, type IngestRow, type IngestResult } from "./ingest";
import type { MappedRecord, SyncCtx, SyncCursor } from "./contracts";

/** Per-integration sync state, persisted under `integrations.metadata.sync`. */
export interface IntegrationSyncState {
  /** Unix-seconds high-water mark (max synced record date), or null if never synced. */
  cursor: number | null;
  lastSyncAt: string;
  lastError: string | null;
  lastRecordCount: number;
}

/** The full, coherent shape of `integrations.metadata` (connect + sync writers). */
export interface IntegrationMetadata {
  livemode?: boolean;
  sync?: IntegrationSyncState;
  [key: string]: unknown;
}

/**
 * Run an inbound sync for `(companyId, type)`.
 *
 * Pipeline: load creds → read cursor from the integrations row → iterate the
 * connector source (backfill or incremental) → map each `MappedRecord` to an
 * `IngestRow` (resolving its account from `categoryHint`) → `ingestRecords`
 * (dedups on `(companyId, externalId)`, so re-running inserts 0) → advance the
 * cursor and MERGE the sync state into `integrations.metadata` (read-modify-write
 * so the connect-time `livemode` is never clobbered).
 *
 * Money crosses the boundary as a STRING (`String(record.amount)`) — no number
 * arithmetic on amounts. Cursor math is on unix-seconds integers (not money).
 *
 * On any failure during the run, `metadata.sync.lastError` is recorded (so health
 * is visible) and the error is rethrown.
 */
export async function runIntegrationSync(
  companyId: string,
  type: string,
  { mode }: { mode: "backfill" | "incremental" }
): Promise<IngestResult> {
  registerConnectors();
  const connector = integrationRegistry.get(type);
  const source = connector?.source;
  if (!source) {
    throw new Error(`Integration "${type}" has no inbound source to sync.`);
  }

  const secret = await getDecryptedIntegrationSecret(companyId, type as never);
  if (!secret) {
    throw new Error(`No stored credentials for integration "${type}"; connect it first.`);
  }

  // Read-modify-write base: the current integrations row + its metadata.
  const [existing] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.companyId, companyId), eq(integrations.type, type as never)))
    .limit(1);

  const prevMeta: IntegrationMetadata = (existing?.metadata as IntegrationMetadata | null) ?? {};
  const prevCursor: number | null = prevMeta.sync?.cursor ?? null;

  const ctx: SyncCtx = { companyId, apiKey: secret.apiKey };

  let recordCount = 0;
  let maxCreated: number | null = null;

  try {
    const cursor: SyncCursor = prevCursor != null ? { created: prevCursor } : null;
    const iterable: AsyncIterable<MappedRecord> =
      mode === "backfill" ? source.backfill(ctx) : source.incremental(ctx, cursor);

    // Resolve accounts ONCE per run (not per record). Reads the account list a
    // single time and find-or-creates the fees account exactly once, so a
    // multi-fee backfill can't insert a duplicate fees account off a stale
    // `unstable_cache`-wrapped `getAccounts` read. See accounts.ts for the
    // accepted cross-run race caveat.
    const resolveAccount = await buildAccountResolver(companyId);

    const rows: IngestRow[] = [];
    for await (const record of iterable) {
      const accountId = resolveAccount(record.categoryHint);
      rows.push({
        accountId,
        date: record.date,
        amount: String(record.amount), // Decimal at the boundary — STRING, never number math.
        description: record.description,
        vendor: record.vendor ?? null,
        source: "integration",
        externalId: record.externalId,
        metadata: record.metadata ?? null,
      });
      recordCount++;
      const created = Math.floor(record.date.getTime() / 1000);
      if (maxCreated == null || created > maxCreated) maxCreated = created;
    }

    const result = await ingestRecords(companyId, rows);

    // No records ⇒ keep the old cursor (don't rewind the high-water mark).
    const newCursor = maxCreated != null ? maxCreated : prevCursor;
    await writeSyncState(existing?.id, prevMeta, {
      cursor: newCursor,
      lastSyncAt: new Date().toISOString(),
      lastError: null,
      lastRecordCount: recordCount,
    });

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Record the failure for health visibility, keeping the prior cursor.
    await writeSyncState(existing?.id, prevMeta, {
      cursor: prevCursor,
      lastSyncAt: new Date().toISOString(),
      lastError: message,
      lastRecordCount: recordCount,
    }).catch(() => {
      /* swallow secondary failure — the original error is what matters */
    });
    throw err;
  }
}

/**
 * MERGE the sync state into the integrations row's metadata. Spreads the existing
 * metadata (preserving `livemode` and any other connect-time fields) and replaces
 * only `metadata.sync`, then sets `lastSyncAt`. No-op if there is no row id.
 */
async function writeSyncState(
  rowId: string | undefined,
  prevMeta: IntegrationMetadata,
  sync: IntegrationSyncState
): Promise<void> {
  if (!rowId) return;
  const metadata: IntegrationMetadata = { ...prevMeta, sync };
  await db
    .update(integrations)
    .set({ lastSyncAt: new Date(), metadata })
    .where(eq(integrations.id, rowId));
}
