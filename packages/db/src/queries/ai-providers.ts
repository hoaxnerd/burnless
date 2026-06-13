/**
 * AI provider / model queries (P2 universal-provider). Mirrors queries/mcp.ts:
 * encryption happens HERE (callers pass plaintext keys, never read apiKeyEncrypted),
 * single default provider per company + single default model per provider enforced
 * here, everything company-scoped. The returned provider shape OMITS apiKeyEncrypted.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../index";
import { aiProviders, aiProviderModels } from "../schema";
import { encryptSecret, decryptSecret } from "../crypto";

export type AiProviderModelRow = typeof aiProviderModels.$inferSelect;
export type AiProviderPublic = Omit<typeof aiProviders.$inferSelect, "apiKeyEncrypted"> & { apiKeySet: boolean };
type ProviderKind = (typeof aiProviders.$inferSelect)["kind"];
type ApiKeyMode = (typeof aiProviders.$inferSelect)["apiKeyMode"];

function toPublic(row: typeof aiProviders.$inferSelect): AiProviderPublic {
  const { apiKeyEncrypted, ...rest } = row;
  return { ...rest, apiKeySet: apiKeyEncrypted != null };
}

export async function listAiProviders(companyId: string): Promise<AiProviderPublic[]> {
  const rows = await db.select().from(aiProviders).where(eq(aiProviders.companyId, companyId));
  return rows.map(toPublic);
}
export async function getAiProvider(id: string, companyId: string): Promise<AiProviderPublic | null> {
  const [row] = await db.select().from(aiProviders).where(and(eq(aiProviders.id, id), eq(aiProviders.companyId, companyId))).limit(1);
  return row ? toPublic(row) : null;
}
export async function createAiProvider(data: {
  companyId: string; name: string; kind: ProviderKind; baseUrl?: string | null;
  apiKey?: string | null; apiKeyMode?: ApiKeyMode; headers?: Record<string, string> | null; dropParams?: Record<string, unknown> | null;
}): Promise<AiProviderPublic> {
  // First provider for the company becomes the default. This SELECT-then-INSERT is
  // not transactional: under truly concurrent "add first provider" requests two rows
  // could both be isDefault. Safe in P2's shipped surface — the config API is
  // managedAiProvider-gated OFF (self-host single Node process; cloud 403s the API),
  // and the boot backfill is single-threaded. Harden with a partial unique index
  // (companyId WHERE is_default) if/when cloud BYO-provider lands (spec §11).
  const existing = await db.select({ id: aiProviders.id }).from(aiProviders).where(eq(aiProviders.companyId, data.companyId)).limit(1);
  const isDefault = existing.length === 0;
  const [row] = await db.insert(aiProviders).values({
    companyId: data.companyId, name: data.name, kind: data.kind, baseUrl: data.baseUrl ?? null,
    apiKeyEncrypted: data.apiKey ? encryptSecret(data.apiKey) : null,
    apiKeyMode: data.apiKeyMode ?? "user_provided", headers: data.headers ?? null, dropParams: data.dropParams ?? null, isDefault,
  }).returning();
  return toPublic(row!);
}
export async function updateAiProvider(id: string, companyId: string, patch: {
  name?: string; baseUrl?: string | null; apiKey?: string | null; apiKeyMode?: ApiKeyMode;
  headers?: Record<string, string> | null; dropParams?: Record<string, unknown> | null; enabled?: boolean;
}): Promise<AiProviderPublic | null> {
  const values: Record<string, unknown> = {};
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.baseUrl !== undefined) values.baseUrl = patch.baseUrl;
  if (patch.apiKeyMode !== undefined) values.apiKeyMode = patch.apiKeyMode;
  if (patch.headers !== undefined) values.headers = patch.headers;
  if (patch.dropParams !== undefined) values.dropParams = patch.dropParams;
  if (patch.enabled !== undefined) values.enabled = patch.enabled;
  if (patch.apiKey !== undefined) values.apiKeyEncrypted = patch.apiKey ? encryptSecret(patch.apiKey) : null;
  if (Object.keys(values).length === 0) return getAiProvider(id, companyId);
  const [row] = await db.update(aiProviders).set(values).where(and(eq(aiProviders.id, id), eq(aiProviders.companyId, companyId))).returning();
  return row ? toPublic(row) : null;
}
export async function deleteAiProvider(id: string, companyId: string): Promise<boolean> {
  const rows = await db.delete(aiProviders).where(and(eq(aiProviders.id, id), eq(aiProviders.companyId, companyId))).returning({ id: aiProviders.id });
  return rows.length > 0;
}
export async function setDefaultAiProvider(id: string, companyId: string): Promise<boolean> {
  const target = await getAiProvider(id, companyId);
  if (!target) return false;
  await db.transaction(async (tx) => {
    await tx.update(aiProviders).set({ isDefault: false }).where(eq(aiProviders.companyId, companyId));
    await tx.update(aiProviders).set({ isDefault: true }).where(and(eq(aiProviders.id, id), eq(aiProviders.companyId, companyId)));
  });
  return true;
}
export async function getDefaultAiProvider(companyId: string): Promise<typeof aiProviders.$inferSelect | null> {
  const [row] = await db.select().from(aiProviders).where(and(eq(aiProviders.companyId, companyId), eq(aiProviders.isDefault, true), eq(aiProviders.enabled, true))).limit(1);
  return row ?? null;
}
export async function getDecryptedProviderKey(id: string, companyId: string): Promise<string | null> {
  const [row] = await db.select({ enc: aiProviders.apiKeyEncrypted }).from(aiProviders).where(and(eq(aiProviders.id, id), eq(aiProviders.companyId, companyId))).limit(1);
  if (!row?.enc) return null;
  return decryptSecret(row.enc);
}
// ── Models ──────────────────────────────────────────────────────────────────
// PRECONDITION: these functions key off providerId only (aiProviderModels has no
// companyId column — ownership flows through the parent aiProviders row). Callers
// MUST verify the provider belongs to the company first via getAiProvider(id, companyId)
// before calling any model function. The provider config API routes do this (404 on
// a foreign/missing provider) before touching models. Mirrors the mcp.ts tool-pref pattern.
export async function listAiProviderModels(providerId: string): Promise<AiProviderModelRow[]> {
  return db.select().from(aiProviderModels).where(eq(aiProviderModels.providerId, providerId));
}
export async function addAiProviderModel(providerId: string, data: {
  modelId: string; displayName?: string | null; contextWindow?: number | null; maxOutputTokens?: number | null;
  supportsTools?: boolean | null; supportsImages?: boolean | null; source: AiProviderModelRow["source"]; enabled?: boolean;
}): Promise<AiProviderModelRow> {
  const [row] = await db.insert(aiProviderModels).values({
    providerId, modelId: data.modelId, displayName: data.displayName ?? null, contextWindow: data.contextWindow ?? null,
    maxOutputTokens: data.maxOutputTokens ?? null, supportsTools: data.supportsTools ?? null, supportsImages: data.supportsImages ?? null,
    source: data.source, enabled: data.enabled ?? true,
  }).onConflictDoUpdate({
    target: [aiProviderModels.providerId, aiProviderModels.modelId],
    set: { displayName: data.displayName ?? null, contextWindow: data.contextWindow ?? null, maxOutputTokens: data.maxOutputTokens ?? null,
      supportsTools: data.supportsTools ?? null, supportsImages: data.supportsImages ?? null, source: data.source },
  }).returning();
  return row!;
}
export async function setDefaultAiProviderModel(modelId: string, providerId: string): Promise<boolean> {
  const [target] = await db.select({ id: aiProviderModels.id }).from(aiProviderModels).where(and(eq(aiProviderModels.id, modelId), eq(aiProviderModels.providerId, providerId))).limit(1);
  if (!target) return false;
  await db.transaction(async (tx) => {
    await tx.update(aiProviderModels).set({ isDefault: false }).where(eq(aiProviderModels.providerId, providerId));
    await tx.update(aiProviderModels).set({ isDefault: true }).where(and(eq(aiProviderModels.id, modelId), eq(aiProviderModels.providerId, providerId)));
  });
  return true;
}
export async function getResolvedDefaultModelId(providerId: string): Promise<string | null> {
  const [row] = await db.select({ modelId: aiProviderModels.modelId }).from(aiProviderModels).where(and(eq(aiProviderModels.providerId, providerId), eq(aiProviderModels.isDefault, true), eq(aiProviderModels.enabled, true))).limit(1);
  return row?.modelId ?? null;
}
