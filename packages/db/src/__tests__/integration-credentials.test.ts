import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { getTestDb } from "./setup";

vi.mock("../index", () => ({
  get db() {
    return getTestDb();
  },
}));

import { createUser, createCompany } from "./factories";
import {
  saveIntegrationCredentials,
  getDecryptedIntegrationSecret,
  deleteIntegrationCredentials,
} from "../queries/integration-credentials";
import { __resetSecretsKeyCache } from "../crypto";

beforeAll(() => {
  process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  __resetSecretsKeyCache();
});

describe("integrationCredentials", () => {
  let companyId: string;

  beforeEach(async () => {
    const owner = await createUser();
    const company = await createCompany(owner.id);
    companyId = company.id;
  });

  it("round-trips an encrypted secret and is not stored in plaintext", async () => {
    await saveIntegrationCredentials(
      companyId,
      "stripe",
      { apiKey: "rk_test_abc123" },
      { livemode: false, metadata: { country: "US" } },
    );

    const secret = await getDecryptedIntegrationSecret(companyId, "stripe");
    expect(secret).toEqual({ apiKey: "rk_test_abc123" });

    // raw column must be ciphertext, never plaintext
    const { integrationCredentials } = await import("../schema");
    const rows = await getTestDb().select().from(integrationCredentials);
    const row = rows.find((r) => r.companyId === companyId)!;
    expect(row.secret).not.toContain("rk_test_abc123");
    expect(row.secret.startsWith("v1:")).toBe(true);
    expect(row.livemode).toBe(false);
    expect(row.metadata).toEqual({ country: "US" });
  });

  it("upserts (one row per company+type) and deletes", async () => {
    await saveIntegrationCredentials(companyId, "stripe", { apiKey: "rk_test_1" }, { livemode: false });
    await saveIntegrationCredentials(companyId, "stripe", { apiKey: "rk_test_2" }, { livemode: false });

    const { integrationCredentials } = await import("../schema");
    const rows = await getTestDb()
      .select()
      .from(integrationCredentials);
    expect(rows.filter((r) => r.companyId === companyId)).toHaveLength(1);

    expect(await getDecryptedIntegrationSecret(companyId, "stripe")).toEqual({ apiKey: "rk_test_2" });

    await deleteIntegrationCredentials(companyId, "stripe");
    expect(await getDecryptedIntegrationSecret(companyId, "stripe")).toBeNull();
  });
});
