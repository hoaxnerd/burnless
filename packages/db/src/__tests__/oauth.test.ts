/**
 * OAuth AS query layer (spec §5.2): single-use 10-min codes, hashed at rest;
 * token issuance; refresh rotation; reuse-detection family revocation;
 * grant listing + revocation.
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
import { oauthAuthCodes, oauthTokens } from "../schema";
import { sha256hex } from "../token-hash";
import {
  createOauthClient,
  getOauthClientById,
  createAuthCode,
  consumeAuthCode,
  issueOauthTokens,
  findOauthTokenByAccessHash,
  rotateRefreshToken,
  listOauthGrantsForUser,
  revokeOauthGrant,
} from "../queries/oauth";

const RESOURCE = "http://localhost:3000/mcp";

async function seed() {
  const user = await createUser();
  const company = await createCompany(user.id);
  const client = await createOauthClient({
    name: "Claude",
    redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
  });
  return { user, company, client };
}

describe("oauth clients", () => {
  it("create + fetch by id", async () => {
    const client = await createOauthClient({ name: "Cursor", redirectUris: ["http://localhost:8765/cb"] });
    const fetched = await getOauthClientById(client.id);
    expect(fetched?.name).toBe("Cursor");
    expect(await getOauthClientById("nope")).toBeNull();
  });
});

describe("auth codes", () => {
  it("code is hashed at rest and single-use", async () => {
    const db = getTestDb();
    const { user, company, client } = await seed();
    const { code } = await createAuthCode({
      clientId: client.id,
      userId: user.id,
      companyId: company.id,
      scopes: ["read", "write"],
      codeChallenge: "challenge",
      resource: RESOURCE,
      redirectUri: "https://claude.ai/api/mcp/auth_callback",
    });
    const [stored] = await db
      .select()
      .from(oauthAuthCodes)
      .where(eq(oauthAuthCodes.codeHash, sha256hex(code)));
    expect(stored).toBeDefined();
    expect(stored!.codeHash).not.toContain(code.slice("bl_ac_".length, "bl_ac_".length + 10));
    const consumed = await consumeAuthCode(code);
    expect(consumed?.scopes).toEqual(["read", "write"]);
    expect(await consumeAuthCode(code)).toBeNull(); // single-use (spec §5.2)
  });

  it("expired code cannot be consumed", async () => {
    const db = getTestDb();
    const { user, company, client } = await seed();
    const { code } = await createAuthCode({
      clientId: client.id,
      userId: user.id,
      companyId: company.id,
      scopes: ["read"],
      codeChallenge: "c",
      resource: RESOURCE,
      redirectUri: "https://claude.ai/api/mcp/auth_callback",
    });
    await db
      .update(oauthAuthCodes)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(oauthAuthCodes.codeHash, sha256hex(code)));
    expect(await consumeAuthCode(code)).toBeNull();
  });
});

describe("token issuance + rotation (spec §5.2)", () => {
  it("issue stores only hashes; access lookup works", async () => {
    const { user, company, client } = await seed();
    const issued = await issueOauthTokens({
      clientId: client.id,
      userId: user.id,
      companyId: company.id,
      scopes: ["read"],
      resource: RESOURCE,
    });
    expect(issued.accessToken.startsWith("bl_at_")).toBe(true);
    expect(issued.refreshToken.startsWith("bl_rt_")).toBe(true);
    expect(issued.row.accessTokenHash).toBe(sha256hex(issued.accessToken));
    const found = await findOauthTokenByAccessHash(sha256hex(issued.accessToken));
    expect(found?.grantId).toBe(issued.row.grantId);
  });

  it("rotation supersedes old refresh; reuse revokes the family", async () => {
    const db = getTestDb();
    const { user, company, client } = await seed();
    const first = await issueOauthTokens({
      clientId: client.id,
      userId: user.id,
      companyId: company.id,
      scopes: ["read", "write"],
      resource: RESOURCE,
    });
    const rotated = await rotateRefreshToken(first.refreshToken);
    expect(rotated.status).toBe("rotated");
    if (rotated.status !== "rotated") throw new Error("unreachable");
    expect(rotated.row.grantId).toBe(first.row.grantId);
    // old row superseded
    const [oldRow] = await db.select().from(oauthTokens).where(eq(oauthTokens.id, first.row.id));
    expect(oldRow!.supersededAt).not.toBeNull();
    // REUSE of the superseded refresh → entire family revoked
    const reuse = await rotateRefreshToken(first.refreshToken);
    expect(reuse.status).toBe("reuse_detected");
    const family = await db
      .select()
      .from(oauthTokens)
      .where(eq(oauthTokens.grantId, first.row.grantId));
    expect(family.every((r) => r.revokedAt !== null)).toBe(true);
    // the new refresh token is now dead too
    expect((await rotateRefreshToken(rotated.refreshToken)).status).toBe("invalid");
  });

  it("garbage refresh token is invalid", async () => {
    expect((await rotateRefreshToken("bl_rt_garbage")).status).toBe("invalid");
  });
});

describe("grants UI queries", () => {
  it("list shows current grant rows; revokeOauthGrant kills the family", async () => {
    const { user, company, client } = await seed();
    const issued = await issueOauthTokens({
      clientId: client.id,
      userId: user.id,
      companyId: company.id,
      scopes: ["read"],
      resource: RESOURCE,
    });
    const grants = await listOauthGrantsForUser(company.id, user.id);
    expect(grants).toHaveLength(1);
    expect(grants[0]!.clientName).toBe("Claude");
    expect(await revokeOauthGrant(issued.row.grantId, company.id, user.id)).toBe(true);
    expect(await listOauthGrantsForUser(company.id, user.id)).toHaveLength(0);
    expect(await findOauthTokenByAccessHash(sha256hex(issued.accessToken)).then((r) => r?.revokedAt)).not.toBeNull();
  });
});
