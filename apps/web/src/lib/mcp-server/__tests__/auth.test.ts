/**
 * Bearer verifier matrix (spec §5.4 / §8): PAT/OAuth × valid/expired/revoked/
 * superseded/wrong-resource/demoted-role/removed-member, plus the 401
 * WWW-Authenticate shape (RFC 9728 PRM pointer).
 */
import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { createUser, createCompany, createMember } from "@db-test/factories";
import { getTestDb } from "@db-test/setup";
import {
  apiTokens,
  oauthTokens,
  companyMembers,
  mintApiToken,
  issueOauthTokens,
  createOauthClient,
} from "@burnless/db";
import { verifyMcpBearer, mcpUnauthorizedResponse } from "../auth";

process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
const RESOURCE = "http://localhost:3000/mcp";

describe("verifyMcpBearer — PAT path", () => {
  it("valid PAT → identity + effective scopes", async () => {
    const user = await createUser();
    const company = await createCompany(user.id);
    await createMember(company.id, user.id, { role: "owner" });
    const { row, plaintext } = await mintApiToken({
      userId: user.id,
      companyId: company.id,
      name: "t",
      scopes: ["read", "write"],
    });
    const result = await verifyMcpBearer(`Bearer ${plaintext}`);
    expect(result).toEqual({
      userId: user.id,
      companyId: company.id,
      scopes: ["read", "write"],
      credentialType: "pat",
      credentialId: row.id,
    });
  });

  it("revoked / expired / garbage / missing header → null", async () => {
    const user = await createUser();
    const company = await createCompany(user.id);
    await createMember(company.id, user.id, { role: "owner" });
    const db = getTestDb();

    const revoked = await mintApiToken({ userId: user.id, companyId: company.id, name: "r", scopes: ["read"] });
    await db.update(apiTokens).set({ revokedAt: new Date() }).where(eq(apiTokens.id, revoked.row.id));
    expect(await verifyMcpBearer(`Bearer ${revoked.plaintext}`)).toBeNull();

    const expired = await mintApiToken({
      userId: user.id, companyId: company.id, name: "e", scopes: ["read"],
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(await verifyMcpBearer(`Bearer ${expired.plaintext}`)).toBeNull();

    expect(await verifyMcpBearer("Bearer bl_pat_garbage")).toBeNull();
    expect(await verifyMcpBearer("Bearer not_a_prefix")).toBeNull();
    expect(await verifyMcpBearer(null)).toBeNull();
    expect(await verifyMcpBearer("Basic dXNlcjpwdw==")).toBeNull();
  });

  it("demoted member's scopes shrink at verify time (spec §5.1 re-cap)", async () => {
    const user = await createUser();
    const company = await createCompany(user.id);
    const member = await createMember(company.id, user.id, { role: "editor" });
    const { plaintext } = await mintApiToken({
      userId: user.id, companyId: company.id, name: "d", scopes: ["read", "write", "delete"],
    });
    const before = await verifyMcpBearer(`Bearer ${plaintext}`);
    expect(before?.scopes).toEqual(["read", "write", "delete"]);
    const db = getTestDb();
    await db.update(companyMembers).set({ role: "viewer" }).where(eq(companyMembers.id, member.id));
    const after = await verifyMcpBearer(`Bearer ${plaintext}`);
    expect(after?.scopes).toEqual(["read"]);
  });

  it("removed member → all their tokens dead (spec §4.3 step 2)", async () => {
    const user = await createUser();
    const company = await createCompany(user.id);
    const member = await createMember(company.id, user.id, { role: "owner" });
    const { plaintext } = await mintApiToken({
      userId: user.id, companyId: company.id, name: "x", scopes: ["read"],
    });
    const db = getTestDb();
    await db.delete(companyMembers).where(eq(companyMembers.id, member.id));
    expect(await verifyMcpBearer(`Bearer ${plaintext}`)).toBeNull();
  });
});

describe("verifyMcpBearer — OAuth path", () => {
  async function seedOauth(resource = RESOURCE) {
    const user = await createUser();
    const company = await createCompany(user.id);
    await createMember(company.id, user.id, { role: "owner" });
    const client = await createOauthClient({ name: "Claude", redirectUris: ["https://claude.ai/cb"] });
    const issued = await issueOauthTokens({
      clientId: client.id, userId: user.id, companyId: company.id,
      scopes: ["read", "write"], resource,
    });
    return { user, company, issued };
  }

  it("valid access token → identity; credentialId = grantId", async () => {
    const { user, company, issued } = await seedOauth();
    const result = await verifyMcpBearer(`Bearer ${issued.accessToken}`);
    expect(result).toEqual({
      userId: user.id,
      companyId: company.id,
      scopes: ["read", "write"],
      credentialType: "oauth",
      credentialId: issued.row.grantId,
    });
  });

  it("expired / revoked / superseded / wrong-audience → null", async () => {
    const db = getTestDb();
    const a = await seedOauth();
    await db.update(oauthTokens).set({ accessExpiresAt: new Date(Date.now() - 1000) }).where(eq(oauthTokens.id, a.issued.row.id));
    expect(await verifyMcpBearer(`Bearer ${a.issued.accessToken}`)).toBeNull();

    const b = await seedOauth();
    await db.update(oauthTokens).set({ revokedAt: new Date() }).where(eq(oauthTokens.id, b.issued.row.id));
    expect(await verifyMcpBearer(`Bearer ${b.issued.accessToken}`)).toBeNull();

    const c = await seedOauth();
    await db.update(oauthTokens).set({ supersededAt: new Date() }).where(eq(oauthTokens.id, c.issued.row.id));
    expect(await verifyMcpBearer(`Bearer ${c.issued.accessToken}`)).toBeNull();

    const d = await seedOauth("https://other-instance.example/mcp"); // RFC 8707
    expect(await verifyMcpBearer(`Bearer ${d.issued.accessToken}`)).toBeNull();
  });
});

describe("mcpUnauthorizedResponse", () => {
  it("401 with the RFC 9728 WWW-Authenticate pointer", async () => {
    const res = mcpUnauthorizedResponse();
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="http://localhost:3000/.well-known/oauth-protected-resource"'
    );
  });
});
