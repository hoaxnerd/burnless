/**
 * Local AI-provider ops — direct in-process over the P2 @burnless/db ai-providers query
 * layer (keys encrypted there). Boots the DB singleton, resolves the owner's company,
 * resolves user-facing provider NAMES to row ids. No running server (spec L1).
 */
import {
  type AiProviderPublic,
  closeDatabase,
  createAiProvider,
  deleteAiProvider,
  getCompanyForUser,
  getDecryptedProviderKey,
  getOwnerUser,
  initDatabase,
  isDatabaseBooted,
  listAiProviders,
  setDefaultAiProvider,
  updateAiProvider,
} from "@burnless/db";
import { UsageError } from "../errors";
import type { ProviderKind } from "./ai-catalog";

async function withDb<T>(fn: () => Promise<T>): Promise<T> {
  const owned = !isDatabaseBooted();
  await initDatabase();
  try {
    return await fn();
  } finally {
    if (owned) await closeDatabase();
  }
}

/** The owner's (first) company id, or a clear error if there's no company yet. */
export async function resolveLocalCompanyId(): Promise<string> {
  const owner = await getOwnerUser();
  if (!owner) throw new UsageError("No local user yet — run `burnless bootstrap` / `burnless start` first.");
  const membership = await getCompanyForUser(owner.id);
  if (!membership) {
    // cloud-only / defensive post-install: on self-host the install company is created
    // at `bootstrap`/`start` boot (createOwnerCompanyIfNone), so this is unreachable
    // unless the owner manually deleted the company row. Still the normal cloud path.
    throw new UsageError(
      "No company yet — finish onboarding (open the app via `burnless start`) before configuring AI providers.",
    );
  }
  return membership.companyId;
}

async function withCompany<T>(fn: (companyId: string) => Promise<T>): Promise<T> {
  return withDb(async () => fn(await resolveLocalCompanyId()));
}

async function findByName(companyId: string, name: string): Promise<AiProviderPublic> {
  const matches = (await listAiProviders(companyId)).filter((p) => p.name === name);
  if (matches.length === 0) throw new UsageError(`No provider named "${name}". Run \`burnless provider list\`.`);
  if (matches.length > 1) throw new UsageError(`Multiple providers named "${name}" — rename to disambiguate.`);
  return matches[0]!;
}

export async function pList(): Promise<AiProviderPublic[]> {
  return withCompany((companyId) => listAiProviders(companyId));
}

export async function pAdd(input: { name: string; kind: ProviderKind; baseUrl?: string; apiKey?: string }): Promise<AiProviderPublic> {
  return withCompany((companyId) =>
    createAiProvider({ companyId, name: input.name, kind: input.kind, baseUrl: input.baseUrl ?? null, apiKey: input.apiKey ?? null }),
  );
}

export async function pSetKey(name: string, apiKey: string): Promise<void> {
  await withCompany(async (companyId) => {
    const p = await findByName(companyId, name);
    await updateAiProvider(p.id, companyId, { apiKey });
  });
}

export async function pSetDefault(name: string): Promise<void> {
  await withCompany(async (companyId) => {
    const p = await findByName(companyId, name);
    await setDefaultAiProvider(p.id, companyId);
  });
}

export async function pEnable(name: string): Promise<void> {
  await withCompany(async (companyId) => {
    const p = await findByName(companyId, name);
    await updateAiProvider(p.id, companyId, { enabled: true });
  });
}

export async function pDisable(name: string): Promise<void> {
  await withCompany(async (companyId) => {
    const p = await findByName(companyId, name);
    await updateAiProvider(p.id, companyId, { enabled: false });
  });
}

export async function pRemove(name: string): Promise<boolean> {
  return withCompany(async (companyId) => {
    const p = await findByName(companyId, name);
    return deleteAiProvider(p.id, companyId);
  });
}

/** Resolve a provider name → { id, companyId, baseUrl } for callers that need the id (models, test). */
export async function resolveProviderId(name: string): Promise<{ id: string; companyId: string; baseUrl: string | null }> {
  return withCompany(async (companyId) => {
    const p = await findByName(companyId, name);
    return { id: p.id, companyId, baseUrl: p.baseUrl };
  });
}

/** Resolve a provider name → its baseUrl + DECRYPTED key, all in ONE db session (for `provider test`). */
export async function resolveProviderForTest(name: string): Promise<{ id: string; companyId: string; baseUrl: string | null; apiKey: string | null }> {
  return withCompany(async (companyId) => {
    const p = await findByName(companyId, name);
    const apiKey = await getDecryptedProviderKey(p.id, companyId);
    return { id: p.id, companyId, baseUrl: p.baseUrl, apiKey };
  });
}

/** Minimal connectivity check: GET {baseUrl}/v1/models with the key. OpenAI-compatible only. */
export async function verifyConnection(input: { baseUrl: string; apiKey?: string | null; fetchFn?: typeof fetch }): Promise<{ ok: boolean; detail: string }> {
  const f = input.fetchFn ?? fetch;
  const base = input.baseUrl.replace(/\/$/, "");
  const url = base.endsWith("/v1") ? `${base}/models` : `${base}/v1/models`;
  try {
    const res = await f(url, { headers: input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {} });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status} from ${url}` };
    return { ok: true, detail: `Reachable (${url})` };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}
