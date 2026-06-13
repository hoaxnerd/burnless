import { describe, it, expect, beforeAll, vi } from "vitest";
import { getTestDb } from "../../__tests__/setup";

// Mock the db import used by query functions — point it at PGLite.
vi.mock("../../index", () => ({
  get db() {
    return getTestDb();
  },
}));

import { createUser, createCompany } from "../../__tests__/factories";
import { __resetSecretsKeyCache } from "../../crypto";
import {
  createAiProvider,
  listAiProviders,
  getAiProvider,
  updateAiProvider,
  deleteAiProvider,
  setDefaultAiProvider,
  getDefaultAiProvider,
  getDecryptedProviderKey,
  addAiProviderModel,
  listAiProviderModels,
  setDefaultAiProviderModel,
  getResolvedDefaultModelId,
} from "../ai-providers";

// Real harness: no setupTestDb/resetTestDb (setup runs as a vitest setupFile),
// and no createTestCompany factory — build a company from createUser+createCompany.
// Each test creates fresh, company-scoped rows so they stay isolated without a
// per-test DB reset (matches queries/__tests__/funding.test.ts).
async function createTestCompany(): Promise<string> {
  const owner = await createUser();
  const company = await createCompany(owner.id);
  return company.id;
}

beforeAll(() => {
  process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  __resetSecretsKeyCache();
});

describe("ai-providers query layer", () => {
  it("creates a provider, encrypts the key, never exposes plaintext", async () => {
    const companyId = await createTestCompany();
    const p = await createAiProvider({
      companyId,
      name: "My OpenRouter",
      kind: "openrouter",
      apiKey: "sk-secret-123",
      apiKeyMode: "user_provided",
    });
    expect(p.id).toBeTruthy();
    expect(p.isDefault).toBe(true);
    expect((p as Record<string, unknown>).apiKeyEncrypted).toBeUndefined();
    expect(await getDecryptedProviderKey(p.id, companyId)).toBe("sk-secret-123");
  });

  it("enforces a single default provider per company", async () => {
    const companyId = await createTestCompany();
    const a = await createAiProvider({ companyId, name: "A", kind: "anthropic", apiKey: "k1" });
    const b = await createAiProvider({ companyId, name: "B", kind: "openai", apiKey: "k2" });
    expect(a.isDefault).toBe(true);
    expect(b.isDefault).toBe(false);
    await setDefaultAiProvider(b.id, companyId);
    expect((await getDefaultAiProvider(companyId))?.id).toBe(b.id);
    expect((await listAiProviders(companyId)).filter((x) => x.isDefault)).toHaveLength(1);
  });

  it("getDefaultAiProvider ignores disabled providers", async () => {
    const companyId = await createTestCompany();
    const a = await createAiProvider({ companyId, name: "A", kind: "anthropic", apiKey: "k1" });
    await updateAiProvider(a.id, companyId, { enabled: false });
    expect(await getDefaultAiProvider(companyId)).toBeNull();
  });

  it("updateAiProvider re-encrypts only when a new key is provided", async () => {
    const companyId = await createTestCompany();
    const p = await createAiProvider({ companyId, name: "A", kind: "openai", apiKey: "orig" });
    await updateAiProvider(p.id, companyId, { name: "Renamed" });
    expect(await getDecryptedProviderKey(p.id, companyId)).toBe("orig");
    await updateAiProvider(p.id, companyId, { apiKey: "rotated" });
    expect(await getDecryptedProviderKey(p.id, companyId)).toBe("rotated");
  });

  it("manages models with a single default per provider", async () => {
    const companyId = await createTestCompany();
    const p = await createAiProvider({ companyId, name: "A", kind: "openai", apiKey: "k" });
    await addAiProviderModel(p.id, { modelId: "gpt-4o", source: "manual" });
    const m2 = await addAiProviderModel(p.id, { modelId: "gpt-4o-mini", source: "manual" });
    await setDefaultAiProviderModel(m2.id, p.id);
    expect(await getResolvedDefaultModelId(p.id)).toBe("gpt-4o-mini");
    expect((await listAiProviderModels(p.id)).filter((m) => m.isDefault)).toHaveLength(1);
    await addAiProviderModel(p.id, { modelId: "gpt-4o", source: "fetched" });
    expect((await listAiProviderModels(p.id)).filter((m) => m.modelId === "gpt-4o")).toHaveLength(1);
  });

  it("deleteAiProvider cascades models and is company-scoped", async () => {
    const companyId = await createTestCompany();
    const other = await createTestCompany();
    const p = await createAiProvider({ companyId, name: "A", kind: "openai", apiKey: "k" });
    await addAiProviderModel(p.id, { modelId: "gpt-4o", source: "manual" });
    expect(await deleteAiProvider(p.id, other)).toBe(false);
    expect(await deleteAiProvider(p.id, companyId)).toBe(true);
    expect(await listAiProviderModels(p.id)).toHaveLength(0);
  });

  it("preserves the original source when a model is re-added (manual then fetched)", async () => {
    const companyId = await createTestCompany();
    const p = await createAiProvider({ companyId, name: "A", kind: "openai", apiKey: "k" });
    await addAiProviderModel(p.id, { modelId: "gpt-4o", source: "manual" });
    await addAiProviderModel(p.id, { modelId: "gpt-4o", source: "fetched" });
    const rows = (await listAiProviderModels(p.id)).filter((m) => m.modelId === "gpt-4o");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.source).toBe("manual"); // first-seen source preserved
  });

  it("listAiProviders includes modelCount and defaultModelId", async () => {
    const companyId = await createTestCompany();
    const p = await createAiProvider({ companyId, name: "A", kind: "openai", apiKey: "k" });
    await addAiProviderModel(p.id, { modelId: "gpt-4o", source: "manual" });
    const m2 = await addAiProviderModel(p.id, { modelId: "gpt-4o-mini", source: "manual" });
    await setDefaultAiProviderModel(m2.id, p.id);
    const [row] = await listAiProviders(companyId);
    expect(row!.modelCount).toBe(2);
    expect(row!.defaultModelId).toBe("gpt-4o-mini");
  });

  it("setDefaultAiProviderModel does not affect another provider's default model", async () => {
    const companyId = await createTestCompany();
    const p1 = await createAiProvider({ companyId, name: "P1", kind: "openai", apiKey: "k1" });
    const p2 = await createAiProvider({ companyId, name: "P2", kind: "openai", apiKey: "k2" });
    const m1 = await addAiProviderModel(p1.id, { modelId: "gpt-4o", source: "manual" });
    const m2 = await addAiProviderModel(p2.id, { modelId: "gpt-4o-mini", source: "manual" });
    await setDefaultAiProviderModel(m1.id, p1.id);
    await setDefaultAiProviderModel(m2.id, p2.id);
    expect((await listAiProviderModels(p1.id)).find((m) => m.isDefault)?.id).toBe(m1.id);
    expect((await listAiProviderModels(p2.id)).find((m) => m.isDefault)?.id).toBe(m2.id);
  });
});
