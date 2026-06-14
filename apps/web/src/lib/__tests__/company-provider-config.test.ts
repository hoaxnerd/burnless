/**
 * Resolution-precedence tests for getCompanyProviderConfig.
 * S6 W1.1: the legacy aiFeatureFlags BYOK middle leg was removed — resolution is
 * now DB default provider -> env (undefined). Legacy columns are IGNORED.
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
import { createAiProvider, addAiProviderModel, setDefaultAiProviderModel, updateAiProvider, __resetSecretsKeyCache } from "@burnless/db";
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
  it("DB provider resolves", async () => {
    const companyId = await freshCompany();
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
  it("a disabled DB provider yields env path (undefined)", async () => {
    const companyId = await freshCompany();
    const p = await createAiProvider({ companyId, name: "OR", kind: "openrouter", apiKey: "sk-db" });
    await updateAiProvider(p.id, companyId, { enabled: false });
    // getDefaultAiProvider ignores the disabled provider → undefined.
    expect(await getCompanyProviderConfig(companyId)).toBeUndefined();
  });
});
