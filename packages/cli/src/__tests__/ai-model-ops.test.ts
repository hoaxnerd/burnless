import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __resetSecretsKeyCache, closeDatabase, companies, companyMembers, createOwnerUserIfNone, db, getOwnerUser, initDatabase } from "@burnless/db";
import { pAdd } from "../local/ai-provider-ops";
import { mAdd, mDefault, mList } from "../local/ai-model-ops";

const KEY = Buffer.alloc(32, 7).toString("base64"); // 32 bytes b64 (task's literal was 26 bytes)
let dataDir: string;
beforeEach(async () => {
  dataDir = mkdtempSync(join(os.tmpdir(), "bl-aimodel-"));
  process.env.BURNLESS_DB_DRIVER = "pglite";
  process.env.BURNLESS_DATA_DIR = dataDir;
  process.env.SECRETS_ENCRYPTION_KEY = KEY;
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

describe("model ops (local, direct)", () => {
  it("adds models to a provider, lists them, sets a default", async () => {
    await pAdd({ name: "OR", kind: "openrouter", baseUrl: "https://openrouter.ai/api/v1", apiKey: "k" });
    await mAdd("OR", "openai/gpt-4o-mini");
    await mAdd("OR", "anthropic/claude-sonnet-4");

    const models = await mList("OR");
    expect(models.map((m) => m.modelId).sort()).toEqual(["anthropic/claude-sonnet-4", "openai/gpt-4o-mini"]);

    await mDefault("OR", "openai/gpt-4o-mini");
    expect((await mList("OR")).find((m) => m.modelId === "openai/gpt-4o-mini")!.isDefault).toBe(true);
  });

  it("throws for an unknown model on default", async () => {
    await pAdd({ name: "OR", kind: "openrouter", apiKey: "k" });
    await expect(mDefault("OR", "ghost-model")).rejects.toThrow(/ghost-model/i);
  });
});
