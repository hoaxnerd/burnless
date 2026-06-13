/**
 * Idempotent boot backfill (P2 / spec §4 + data-is-sacred). Migrates legacy
 * single-provider aiFeatureFlags BYOK config into the encrypted aiProviders model.
 * Mirrors the S3a system-job-migration precedent: run-twice-safe, non-fatal, skips
 * companies that already have an aiProviders row. Returns the count migrated.
 * Legacy columns are NOT deleted here (dropped in S6 after prod verification);
 * resolution (getCompanyProviderConfig) still reads them as a fallback meanwhile.
 */
import { db, aiFeatureFlags, aiProviders, createAiProvider, addAiProviderModel, setDefaultAiProviderModel } from "@burnless/db";
import { eq } from "drizzle-orm";
import { PROVIDER_CATALOG, type ProviderKind } from "@burnless/ai";

function normalizeKind(raw: string | null): ProviderKind {
  if (raw && raw in PROVIDER_CATALOG) return raw as ProviderKind;
  return "anthropic";
}

export async function backfillAiProviders(): Promise<number> {
  if (!process.env.SECRETS_ENCRYPTION_KEY) {
    console.warn("[ai-providers] backfill skipped — SECRETS_ENCRYPTION_KEY not set");
    return 0;
  }
  const legacyRows = await db.select({
    companyId: aiFeatureFlags.companyId,
    byokEnabled: aiFeatureFlags.byokEnabled,
    aiProvider: aiFeatureFlags.aiProvider,
    aiApiKey: aiFeatureFlags.aiApiKey,
    aiModel: aiFeatureFlags.aiModel,
    aiBaseUrl: aiFeatureFlags.aiBaseUrl,
  }).from(aiFeatureFlags).where(eq(aiFeatureFlags.byokEnabled, true));

  let migrated = 0;
  for (const row of legacyRows) {
    try {
      if (!row.byokEnabled || !row.aiApiKey) continue;
      const existing = await db.select({ id: aiProviders.id }).from(aiProviders).where(eq(aiProviders.companyId, row.companyId)).limit(1);
      if (existing.length > 0) continue;
      const kind = normalizeKind(row.aiProvider);
      const provider = await createAiProvider({
        companyId: row.companyId, name: `${PROVIDER_CATALOG[kind].label} (migrated)`, kind,
        baseUrl: row.aiBaseUrl ?? null, apiKey: row.aiApiKey, apiKeyMode: "user_provided",
      });
      if (row.aiModel) {
        const model = await addAiProviderModel(provider.id, { modelId: row.aiModel, source: "manual" });
        await setDefaultAiProviderModel(model.id, provider.id);
      }
      migrated++;
    } catch (err) {
      console.warn(`[ai-providers] backfill skipped companyId=${row.companyId}:`, (err as Error).message);
    }
  }
  if (migrated > 0) console.log(`[ai-providers] backfilled ${migrated} legacy provider config(s)`);
  return migrated;
}
