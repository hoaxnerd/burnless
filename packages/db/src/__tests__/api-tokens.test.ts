/**
 * PAT query layer (spec §5.1): mint returns plaintext once + stores only the
 * hash; role caps; revocation; expiry-agnostic lookup; throttled lastUsedAt.
 */
import { describe, it, expect, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "./setup";

vi.mock("../index", () => ({
  get db() {
    return getTestDb();
  },
}));

import { createUser, createCompany } from "./factories";
import { apiTokens } from "../schema";
import { sha256hex, generateSecretToken } from "../token-hash";
import {
  mintApiToken,
  listApiTokensForUser,
  revokeApiToken,
  findApiTokenByHash,
  touchApiTokenLastUsed,
  roleScopeCap,
} from "../queries/api-tokens";

describe("token-hash helper", () => {
  it("sha256hex is deterministic hex", () => {
    expect(sha256hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("generateSecretToken: prefix + 32-byte base64url secret, hash matches, lastFour is mask material", () => {
    const g = generateSecretToken("bl_pat_");
    expect(g.token.startsWith("bl_pat_")).toBe(true);
    const secret = g.token.slice("bl_pat_".length);
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes base64url = 43 chars
    expect(g.hash).toBe(sha256hex(g.token));
    expect(g.lastFour).toBe(secret.slice(-4));
  });
});

describe("roleScopeCap (spec §5.1)", () => {
  it("viewer → read only; editor/admin/owner → all three; unknown → none", () => {
    expect(roleScopeCap("viewer")).toEqual(["read"]);
    expect(roleScopeCap("editor")).toEqual(["read", "write", "delete"]);
    expect(roleScopeCap("admin")).toEqual(["read", "write", "delete"]);
    expect(roleScopeCap("owner")).toEqual(["read", "write", "delete"]);
    expect(roleScopeCap("intruder")).toEqual([]);
  });
});

describe("PAT queries", () => {
  it("mint stores ONLY the hash; plaintext verifies via findApiTokenByHash", async () => {
    const user = await createUser();
    const company = await createCompany(user.id);
    const { row, plaintext } = await mintApiToken({
      userId: user.id,
      companyId: company.id,
      name: "Claude Desktop",
      scopes: ["read", "write"],
    });
    expect(plaintext.startsWith("bl_pat_")).toBe(true);
    expect(row.tokenHash).toBe(sha256hex(plaintext));
    expect(row.tokenHash).not.toContain(plaintext.slice("bl_pat_".length));
    expect(row.lastFour).toBe(plaintext.slice(-4));
    const found = await findApiTokenByHash(sha256hex(plaintext));
    expect(found?.id).toBe(row.id);
  });

  it("list excludes revoked; revoke is user-scoped", async () => {
    const user = await createUser();
    const other = await createUser();
    const company = await createCompany(user.id);
    const { row } = await mintApiToken({
      userId: user.id,
      companyId: company.id,
      name: "CI reporting",
      scopes: ["read"],
    });
    expect(await listApiTokensForUser(company.id, user.id)).toHaveLength(1);
    // another user cannot revoke my token
    expect(await revokeApiToken(row.id, company.id, other.id)).toBe(false);
    expect(await revokeApiToken(row.id, company.id, user.id)).toBe(true);
    expect(await listApiTokensForUser(company.id, user.id)).toHaveLength(0);
    // double revoke is a no-op
    expect(await revokeApiToken(row.id, company.id, user.id)).toBe(false);
  });

  it("touchApiTokenLastUsed throttles to one write per 60s", async () => {
    const db = getTestDb();
    const user = await createUser();
    const company = await createCompany(user.id);
    const { row } = await mintApiToken({
      userId: user.id,
      companyId: company.id,
      name: "Throttle",
      scopes: ["read"],
    });
    await touchApiTokenLastUsed(row.id);
    const [first] = await db.select().from(apiTokens).where(eq(apiTokens.id, row.id));
    expect(first!.lastUsedAt).not.toBeNull();
    const firstStamp = first!.lastUsedAt!.getTime();
    await touchApiTokenLastUsed(row.id); // within 60s → no write
    const [second] = await db.select().from(apiTokens).where(eq(apiTokens.id, row.id));
    expect(second!.lastUsedAt!.getTime()).toBe(firstStamp);
  });
});
