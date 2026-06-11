/**
 * Audit attribution threading (spec §4.3 step 7, B5): MCP-context fields land
 * in aiToolAuditLogs; absent fields default to source='chat' (ripple §9.3 —
 * existing chat writers unchanged).
 */
import { describe, it, expect, vi } from "vitest";
import { desc, eq } from "drizzle-orm";
import { createUser, createCompany } from "@db-test/factories";
import { getTestDb } from "@db-test/setup";
import { aiToolAuditLogs } from "@burnless/db";

// ── Import-graph isolation (same idiom as scenario-read-path.test.ts) ───────
// executeToolCall's static graph pulls data.ts → @/lib/auth → next-auth, which
// cannot resolve in the vitest environment. Mock the framework seams only —
// the DB stays real PGLite and executeToolCall/logToolAudit run for real.
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: (fn: unknown) => fn };
});
vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue(null),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => undefined }),
}));

import { executeToolCall } from "../index";

async function latestAuditRow(companyId: string) {
  const db = getTestDb();
  const rows = await db
    .select()
    .from(aiToolAuditLogs)
    .where(eq(aiToolAuditLogs.companyId, companyId))
    .orderBy(desc(aiToolAuditLogs.createdAt))
    .limit(1);
  return rows[0];
}

describe("logToolAudit attribution", () => {
  it("MCP context fields are written to the audit row", async () => {
    const user = await createUser();
    const company = await createCompany(user.id);
    // Unknown tool → validation_error audit row, no handler side effects.
    await executeToolCall("definitely_not_a_tool", {}, {
      companyId: company.id,
      userId: user.id,
      auditSource: "mcp_server",
      credentialType: "pat",
      credentialId: "tok-123",
      clientInfo: { name: "burnless-cli", version: "0.1.0" },
    });
    await vi.waitFor(async () => {
      const row = await latestAuditRow(company.id);
      expect(row).toBeDefined();
      expect(row!.source).toBe("mcp_server");
      expect(row!.credentialType).toBe("pat");
      expect(row!.credentialId).toBe("tok-123");
      expect(row!.clientInfo).toEqual({ name: "burnless-cli", version: "0.1.0" });
    });
  });

  it("absent attribution fields default to source='chat'", async () => {
    const user = await createUser();
    const company = await createCompany(user.id);
    await executeToolCall("definitely_not_a_tool", {}, {
      companyId: company.id,
      userId: user.id,
    });
    await vi.waitFor(async () => {
      const row = await latestAuditRow(company.id);
      expect(row).toBeDefined();
      expect(row!.source).toBe("chat");
      expect(row!.credentialType).toBeNull();
      expect(row!.credentialId).toBeNull();
      expect(row!.clientInfo).toBeNull();
    });
  });
});
