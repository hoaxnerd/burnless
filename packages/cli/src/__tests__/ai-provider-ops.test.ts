import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetSecretsKeyCache, closeDatabase, companies, companyMembers, createOwnerUserIfNone, db, getOwnerUser, initDatabase,
} from "@burnless/db";
import {
  pAdd, pDisable, pEnable, pList, pRemove, resolveLocalCompanyId, resolveProviderForTest, pSetDefault, pSetKey,
} from "../local/ai-provider-ops";

let dataDir: string;
beforeEach(async () => {
  dataDir = mkdtempSync(join(os.tmpdir(), "bl-aiprov-"));
  process.env.BURNLESS_DB_DRIVER = "pglite";
  process.env.BURNLESS_DATA_DIR = dataDir;
  // ai-providers query layer encrypts keys at rest; needs a 32-byte base64 key.
  process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  __resetSecretsKeyCache();
  delete process.env.DATABASE_URL;
  await initDatabase();
  await createOwnerUserIfNone();
  const owner = (await getOwnerUser())!;
  const [co] = await db.insert(companies).values({ name: "Test Co", ownerId: owner.id }).returning();
  await db.insert(companyMembers).values({ companyId: co!.id, userId: owner.id, role: "owner" });
  await closeDatabase();
});
afterEach(async () => {
  await closeDatabase();
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.BURNLESS_DB_DRIVER;
  delete process.env.BURNLESS_DATA_DIR;
  delete process.env.SECRETS_ENCRYPTION_KEY;
  __resetSecretsKeyCache();
});

describe("resolveLocalCompanyId", () => {
  it("resolves the owner's company", async () => {
    await initDatabase();
    try {
      expect(typeof (await resolveLocalCompanyId())).toBe("string");
    } finally {
      await closeDatabase();
    }
  });
});

describe("provider CRUD (local, direct)", () => {
  it("adds, lists, sets key, default, disable/enable, removes by name", async () => {
    const created = await pAdd({ name: "OR", kind: "openrouter", baseUrl: "https://openrouter.ai/api/v1", apiKey: "sk-test" });
    expect(created.name).toBe("OR");
    expect(created.apiKeySet).toBe(true);
    expect(created.isDefault).toBe(true);

    expect((await pList()).map((p) => p.name)).toContain("OR");
    await pSetKey("OR", "sk-rotated");
    await pSetDefault("OR");
    await pDisable("OR");
    expect((await pList()).find((p) => p.name === "OR")!.enabled).toBe(false);
    await pEnable("OR");
    expect((await pList()).find((p) => p.name === "OR")!.enabled).toBe(true);
    expect(await pRemove("OR")).toBe(true);
    expect((await pList()).some((p) => p.name === "OR")).toBe(false);
  });

  it("throws a clear error for an unknown provider name", async () => {
    await expect(pSetKey("ghost", "k")).rejects.toThrow(/ghost/i);
  });
});

describe("resolveProviderForTest", () => {
  it("returns the provider's baseUrl + decrypted key in one session (no closed-DB crash)", async () => {
    await pAdd({ name: "OR", kind: "openrouter", baseUrl: "https://openrouter.ai/api/v1", apiKey: "sk-secret" });
    const r = await resolveProviderForTest("OR");
    expect(r.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(r.apiKey).toBe("sk-secret"); // decrypted, same session — would throw if DB were closed mid-way
  });
});
