/**
 * Schema guard for the MCP expose surface (spec §5.3):
 * apiTokens / oauthClients / oauthAuthCodes / oauthTokens exist with the
 * right uniques + defaults; companies.mcpServerEnabled defaults true;
 * aiToolAuditLogs audit-attribution columns default source='chat'; and the
 * mcp_connections personal-owner CHECK holds.
 */
import { describe, it, expect } from "vitest";
import { getTestDb } from "./setup";
import { createUser, createCompany } from "./factories";
import {
  apiTokens,
  oauthClients,
  oauthAuthCodes,
  oauthTokens,
  aiToolAuditLogs,
  mcpConnections,
} from "../schema";

describe("MCP expose schema (spec §5.3)", () => {
  it("companies.mcpServerEnabled defaults to true (B8)", async () => {
    const user = await createUser();
    const company = await createCompany(user.id);
    expect(company.mcpServerEnabled).toBe(true);
  });

  it("apiTokens: insert works, tokenHash is unique", async () => {
    const db = getTestDb();
    const user = await createUser();
    const company = await createCompany(user.id);
    const [row] = await db
      .insert(apiTokens)
      .values({
        userId: user.id,
        companyId: company.id,
        name: "Claude Desktop",
        tokenHash: "hash-aaa",
        scopes: ["read", "write"],
        lastFour: "f42a",
      })
      .returning();
    expect(row!.revokedAt).toBeNull();
    expect(row!.scopes).toEqual(["read", "write"]);
    await expect(
      db.insert(apiTokens).values({
        userId: user.id,
        companyId: company.id,
        name: "Duplicate hash",
        tokenHash: "hash-aaa",
        scopes: ["read"],
        lastFour: "9c1d",
      })
    ).rejects.toThrow();
  });

  it("oauth tables: client → code → token chain inserts; token hashes unique", async () => {
    const db = getTestDb();
    const user = await createUser();
    const company = await createCompany(user.id);
    const [client] = await db
      .insert(oauthClients)
      .values({ name: "Claude", redirectUris: ["https://claude.ai/api/mcp/auth_callback"] })
      .returning();
    const [code] = await db
      .insert(oauthAuthCodes)
      .values({
        codeHash: "code-hash-1",
        clientId: client!.id,
        userId: user.id,
        companyId: company.id,
        scopes: ["read"],
        codeChallenge: "challenge",
        resource: "http://localhost:3000/mcp",
        redirectUri: "https://claude.ai/api/mcp/auth_callback",
        expiresAt: new Date(Date.now() + 600_000),
      })
      .returning();
    expect(code!.usedAt).toBeNull();
    const [token] = await db
      .insert(oauthTokens)
      .values({
        grantId: "grant-1",
        clientId: client!.id,
        userId: user.id,
        companyId: company.id,
        scopes: ["read"],
        accessTokenHash: "at-hash-1",
        refreshTokenHash: "rt-hash-1",
        resource: "http://localhost:3000/mcp",
        accessExpiresAt: new Date(Date.now() + 3_600_000),
      })
      .returning();
    expect(token!.supersededAt).toBeNull();
    await expect(
      db.insert(oauthTokens).values({
        grantId: "grant-2",
        clientId: client!.id,
        userId: user.id,
        companyId: company.id,
        scopes: ["read"],
        accessTokenHash: "at-hash-1", // duplicate
        refreshTokenHash: "rt-hash-2",
        resource: "http://localhost:3000/mcp",
        accessExpiresAt: new Date(Date.now() + 3_600_000),
      })
    ).rejects.toThrow();
  });

  it("aiToolAuditLogs: source defaults 'chat'; attribution columns accept values", async () => {
    const db = getTestDb();
    const user = await createUser();
    const company = await createCompany(user.id);
    const [defaultRow] = await db
      .insert(aiToolAuditLogs)
      .values({
        companyId: company.id,
        userId: user.id,
        toolName: "get_metrics",
        input: {},
        status: "success",
      })
      .returning();
    expect(defaultRow!.source).toBe("chat");
    expect(defaultRow!.credentialType).toBeNull();
    const [mcpRow] = await db
      .insert(aiToolAuditLogs)
      .values({
        companyId: company.id,
        userId: user.id,
        toolName: "get_metrics",
        input: {},
        status: "success",
        source: "mcp_server",
        credentialType: "pat",
        credentialId: "tok-1",
        clientInfo: { name: "burnless-cli", version: "0.1.0" },
      })
      .returning();
    expect(mcpRow!.source).toBe("mcp_server");
    expect(mcpRow!.clientInfo).toEqual({ name: "burnless-cli", version: "0.1.0" });
  });

  it("mcp_connections CHECK: personal scope requires ownerUserId, company forbids it", async () => {
    const db = getTestDb();
    const user = await createUser();
    const company = await createCompany(user.id);
    // personal WITHOUT owner → rejected by the CHECK
    await expect(
      db.insert(mcpConnections).values({
        companyId: company.id,
        ownerScope: "personal",
        ownerUserId: null,
        name: "Bad personal",
        slug: "bad-personal",
        transport: "streamable_http",
        endpoint: "https://example.com/mcp",
      })
    ).rejects.toThrow();
    // company WITH owner → rejected by the CHECK
    await expect(
      db.insert(mcpConnections).values({
        companyId: company.id,
        ownerScope: "company",
        ownerUserId: user.id,
        name: "Bad company",
        slug: "bad-company",
        transport: "streamable_http",
        endpoint: "https://example.com/mcp",
      })
    ).rejects.toThrow();
  });
});
