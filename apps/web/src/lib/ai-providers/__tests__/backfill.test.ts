import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { getTestDb } from "@db-test/setup";
import { createUser, createCompany } from "@db-test/factories";
import { db, aiFeatureFlags, aiProviders, listAiProviders, getDecryptedProviderKey, __resetSecretsKeyCache } from "@burnless/db";
import { eq } from "drizzle-orm";
import { backfillAiProviders } from "../backfill";

beforeAll(() => {
  process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  __resetSecretsKeyCache();
});

describe("backfillAiProviders", () => {
  it("migrates a legacy BYOK row into an encrypted default provider, idempotently", async () => {
    const user = await createUser();
    const company = await createCompany(user.id);
    await db.insert(aiFeatureFlags).values({
      companyId: company.id, byokEnabled: true, aiProvider: "openrouter",
      aiApiKey: "sk-legacy-plain", aiModel: "anthropic/claude-sonnet-4-20250514", aiBaseUrl: "https://openrouter.ai/api/v1",
    });
    const n1 = await backfillAiProviders();
    expect(n1).toBeGreaterThanOrEqual(1);
    const providers = await listAiProviders(company.id);
    expect(providers).toHaveLength(1);
    expect(providers[0]!.kind).toBe("openrouter");
    expect(providers[0]!.isDefault).toBe(true);
    expect(providers[0]!.apiKeySet).toBe(true);
    expect(await getDecryptedProviderKey(providers[0]!.id, company.id)).toBe("sk-legacy-plain");
    // run-twice-safe — second run migrates nothing for this company
    const before = (await listAiProviders(company.id)).length;
    await backfillAiProviders();
    expect((await listAiProviders(company.id))).toHaveLength(before);
  });

  it("skips companies without a legacy BYOK key", async () => {
    const user = await createUser();
    const company = await createCompany(user.id);
    await db.insert(aiFeatureFlags).values({ companyId: company.id, byokEnabled: false, aiApiKey: null });
    await backfillAiProviders();
    expect(await listAiProviders(company.id)).toHaveLength(0);
  });
});
