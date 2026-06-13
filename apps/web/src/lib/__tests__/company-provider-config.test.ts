/**
 * Resolution-precedence tests for getCompanyProviderConfig (S2/S4 task 5):
 *   DB default provider -> legacy aiFeatureFlags BYOK columns -> env (undefined).
 *
 * HARNESS: real PGLite via @db-test. The module's import graph pulls
 * @/lib/api-helpers -> @/lib/auth -> next-auth, which can't resolve in vitest, so
 * we mock the framework seams only; the DB stays real.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";

// framework-seam mocks (match the real import graph):
vi.mock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: (...a: unknown[]) => unknown) => fn, revalidateTag: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({ get: () => undefined }) }));

import { getTestDb } from "@db-test/setup";
import { createUser, createCompany } from "@db-test/factories";
import { db, aiFeatureFlags, createAiProvider, addAiProviderModel, setDefaultAiProviderModel, updateAiProvider, __resetSecretsKeyCache } from "@burnless/db";
import { getCompanyProviderConfig } from "../ai-feature-flags";

beforeAll(() => {
  process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString("base64");
  __resetSecretsKeyCache();
});

async function freshCompany() {
  const user = await createUser();
  const company = await createCompany(user.id);
  return company.id;
}

describe("getCompanyProviderConfig resolution precedence", () => {
  it("returns undefined (env path) when nothing is configured", async () => {
    expect(await getCompanyProviderConfig(await freshCompany())).toBeUndefined();
  });
  it("resolves the default enabled DB provider, decrypting key + default model", async () => {
    const companyId = await freshCompany();
    const p = await createAiProvider({ companyId, name: "OR", kind: "openrouter", apiKey: "sk-db", baseUrl: "https://openrouter.ai/api/v1" });
    const m = await addAiProviderModel(p.id, { modelId: "anthropic/claude-sonnet-4-20250514", source: "manual" });
    await setDefaultAiProviderModel(m.id, p.id);
    expect(await getCompanyProviderConfig(companyId)).toEqual({
      provider: "openrouter", apiKey: "sk-db", model: "anthropic/claude-sonnet-4-20250514", baseUrl: "https://openrouter.ai/api/v1",
    });
  });
  it("falls back to legacy BYOK columns when no DB provider exists", async () => {
    const companyId = await freshCompany();
    await db.insert(aiFeatureFlags).values({ companyId, byokEnabled: true, aiProvider: "openai", aiApiKey: "sk-legacy", aiModel: "gpt-4o" });
    expect(await getCompanyProviderConfig(companyId)).toEqual({ provider: "openai", apiKey: "sk-legacy", model: "gpt-4o", baseUrl: undefined });
  });
  it("DB provider takes precedence over legacy columns", async () => {
    const companyId = await freshCompany();
    await db.insert(aiFeatureFlags).values({ companyId, byokEnabled: true, aiProvider: "openai", aiApiKey: "sk-legacy" });
    await createAiProvider({ companyId, name: "OR", kind: "openrouter", apiKey: "sk-db" });
    const cfg = await getCompanyProviderConfig(companyId);
    expect(cfg?.provider).toBe("openrouter");
    expect(cfg?.apiKey).toBe("sk-db");
  });
  it("resolves a keyless ollama provider (no apiKey)", async () => {
    const companyId = await freshCompany();
    await createAiProvider({ companyId, name: "Local", kind: "ollama", apiKey: null, apiKeyMode: "none", baseUrl: "http://localhost:11434/v1" });
    const cfg = await getCompanyProviderConfig(companyId);
    expect(cfg?.provider).toBe("ollama");
    expect(cfg?.baseUrl).toBe("http://localhost:11434/v1");
  });
  it("a disabled DB provider falls through to legacy (getDefaultAiProvider ignores disabled)", async () => {
    const companyId = await freshCompany();
    const p = await createAiProvider({ companyId, name: "OR", kind: "openrouter", apiKey: "sk-db" });
    await updateAiProvider(p.id, companyId, { enabled: false });
    await db.insert(aiFeatureFlags).values({ companyId, byokEnabled: true, aiProvider: "openai", aiApiKey: "sk-legacy" });
    expect((await getCompanyProviderConfig(companyId))?.apiKey).toBe("sk-legacy");
  });
});
