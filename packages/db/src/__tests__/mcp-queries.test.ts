import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { getTestDb } from "./setup";

vi.mock("../index", () => ({
  get db() {
    return getTestDb();
  },
}));

import { createUser, createCompany } from "./factories";
import {
  listVisibleConnections,
  getVisibleConnection,
  createMcpConnection,
  updateMcpConnection,
  deleteMcpConnection,
  saveMcpCredentials,
  getDecryptedMcpSecret,
  upsertMcpToolPref,
  listMcpToolPrefs,
  getDisabledMcpConnectionIds,
} from "../queries/mcp";
import { __resetSecretsKeyCache } from "../crypto";

beforeAll(() => {
  process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  __resetSecretsKeyCache();
});

describe("mcp queries", () => {
  let companyId: string;
  let ownerId: string;
  let otherUserId: string;

  beforeEach(async () => {
    const owner = await createUser();
    const other = await createUser();
    const company = await createCompany(owner.id);
    companyId = company.id;
    ownerId = owner.id;
    otherUserId = other.id;
  });

  it("creates a connection with a derived slug and lists it", async () => {
    const conn = await createMcpConnection({
      companyId,
      ownerScope: "company",
      ownerUserId: null,
      name: "Stripe Billing",
      transport: "streamable_http",
      endpoint: "https://mcp.stripe.com",
      authType: "none",
    });
    expect(conn.slug).toBe("stripe-billing");
    const visible = await listVisibleConnections(companyId, otherUserId);
    expect(visible.map((c) => c.id)).toContain(conn.id);
  });

  it("personal connections are visible only to their owner", async () => {
    const personal = await createMcpConnection({
      companyId,
      ownerScope: "personal",
      ownerUserId: ownerId,
      name: "My Linear",
      transport: "streamable_http",
      endpoint: "https://mcp.linear.app/mcp",
      authType: "oauth",
    });
    const mine = await listVisibleConnections(companyId, ownerId);
    const theirs = await listVisibleConnections(companyId, otherUserId);
    expect(mine.map((c) => c.id)).toContain(personal.id);
    expect(theirs.map((c) => c.id)).not.toContain(personal.id);
    expect(await getVisibleConnection(personal.id, companyId, otherUserId)).toBeNull();
  });

  it("round-trips encrypted credentials (PAT)", async () => {
    const conn = await createMcpConnection({
      companyId, ownerScope: "company", ownerUserId: null,
      name: "GitHub", transport: "streamable_http",
      endpoint: "https://api.githubcopilot.com/mcp/", authType: "pat",
    });
    await saveMcpCredentials(conn.id, "pat", { token: "ghp_secret123" });
    const secret = await getDecryptedMcpSecret(conn.id);
    expect(secret).toEqual({ token: "ghp_secret123" });
  });

  it("stores the secret encrypted, not plaintext", async () => {
    const conn = await createMcpConnection({
      companyId, ownerScope: "company", ownerUserId: null,
      name: "Enc Check", transport: "streamable_http",
      endpoint: "https://example.com/mcp", authType: "pat",
    });
    await saveMcpCredentials(conn.id, "pat", { token: "plain-visible?" });
    const { getTestDb } = await import("./setup");
    const { mcpCredentials } = await import("../schema");
    const rows = await getTestDb().select().from(mcpCredentials);
    const row = rows.find((r) => r.mcpConnectionId === conn.id)!;
    expect(row.secret).toMatch(/^v1:/);
    expect(row.secret).not.toContain("plain-visible?");
  });

  it("upserts tool prefs and updates connection fields", async () => {
    const conn = await createMcpConnection({
      companyId, ownerScope: "company", ownerUserId: null,
      name: "Prefs", transport: "streamable_http",
      endpoint: "https://example.com/mcp", authType: "none",
    });
    await upsertMcpToolPref(conn.id, "refund_charge", { enabled: false, permClassOverride: "delete" });
    await upsertMcpToolPref(conn.id, "refund_charge", { enabled: false });
    const prefs = await listMcpToolPrefs(conn.id);
    expect(prefs).toHaveLength(1);
    expect(prefs[0]).toMatchObject({ toolName: "refund_charge", enabled: false, permClassOverride: "delete" });

    await updateMcpConnection(conn.id, companyId, { status: "connected" });
    const after = await getVisibleConnection(conn.id, companyId, ownerId);
    expect(after?.status).toBe("connected");
  });

  it("deletes cascade credentials + prefs", async () => {
    const conn = await createMcpConnection({
      companyId, ownerScope: "company", ownerUserId: null,
      name: "Gone", transport: "streamable_http",
      endpoint: "https://example.com/mcp", authType: "pat",
    });
    await saveMcpCredentials(conn.id, "pat", { token: "t" });
    await deleteMcpConnection(conn.id, companyId);
    expect(await getVisibleConnection(conn.id, companyId, ownerId)).toBeNull();
    expect(await getDecryptedMcpSecret(conn.id)).toBeNull();
  });

  it("getDisabledMcpConnectionIds returns [] when no prefs row", async () => {
    expect(await getDisabledMcpConnectionIds(ownerId, companyId)).toEqual([]);
  });
});
