import { describe, it, expect, vi, beforeEach } from "vitest";

// Gate stack mocked to "allowed" — the test is about the route's orchestration
// (gate → validate → save → upsert row), not the auth/role/capability internals.
vi.mock("@/lib/api-helpers", () => ({
  withErrorHandler: (h: unknown) => h,
  requireCompanyAccess: vi.fn(async () => ({ userId: "u1", companyId: "c1", role: "admin" })),
  requireRole: vi.fn(() => null),
  requirePlanFeature: vi.fn(async () => null),
  parseBody: vi.fn(async (req: Request, schema: { parse: (d: unknown) => unknown }) => ({
    data: schema.parse(await req.json()),
  })),
  errorResponse: (m: string, s: number) =>
    new Response(JSON.stringify({ error: m }), { status: s }),
}));

// Hoisted shared spies (vi.mock factories are hoisted above the module body, so
// the spies they reference must live in a vi.hoisted block to avoid a TDZ error).
const { save, validate, getCapabilities, runIntegrationSync, insertValues, updateSet } = vi.hoisted(() => ({
  save: vi.fn(async () => {}),
  validate: vi.fn(async () => ({ ok: true, livemode: false }) as unknown),
  getCapabilities: vi.fn(() => ({ planEnforcement: false })),
  runIntegrationSync: vi.fn(async () => ({ inserted: 0, skipped: 0 })),
  insertValues: vi.fn(),
  updateSet: vi.fn(),
}));

// The sync runner pulls in @/lib/data (→ next-auth) — stub it so the connect
// route stays isolated. We assert it's KICKED OFF (backfill) but not awaited.
vi.mock("@/lib/integrations/sync", () => ({ runIntegrationSync }));
vi.mock("@/lib/logger", () => ({ logger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }) }));

// planEnforcement OFF by default (self-host) — connect must NOT be blocked.
vi.mock("@/lib/capabilities", () => ({
  requireCapability: vi.fn(() => null),
  getCapabilities: () => getCapabilities(),
}));

// existingRow is mutated per-test to drive the upsert branch (insert vs update).
let existingRow: Record<string, unknown> | null = null;

vi.mock("@burnless/db", () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => (existingRow ? [existingRow] : []) }) }),
    }),
    insert: () => ({
      values: (v: unknown) => {
        insertValues(v);
        return { returning: async () => [{ id: "i1", type: "stripe", status: "active", ...(v as object) }] };
      },
    }),
    update: () => ({
      set: (v: unknown) => {
        updateSet(v);
        return {
          where: () => ({ returning: async () => [{ id: "i1", type: "stripe", status: "active", ...(v as object) }] }),
        };
      },
    }),
  },
  integrations: { id: "id", companyId: "companyId", type: "type" },
  saveIntegrationCredentials: save,
  deleteIntegrationCredentials: vi.fn(),
}));

// Connector validate stubbed to succeed — keep the test off Stripe specifics.
vi.mock("@/lib/integrations/registry", () => ({
  registerConnectors: vi.fn(),
  integrationRegistry: {
    get: vi.fn((id: string) =>
      id === "stripe" ? { credentialSpec: { validate } } : undefined,
    ),
  },
}));

import { POST } from "../route";

describe("POST /api/integrations/connect/[type]", () => {
  beforeEach(() => {
    save.mockClear();
    validate.mockClear();
    runIntegrationSync.mockClear();
    insertValues.mockClear();
    updateSet.mockClear();
    existingRow = null;
    getCapabilities.mockReturnValue({ planEnforcement: false });
  });

  it("validates the key, stores encrypted creds, upserts the row, returns 200", async () => {
    const req = new Request("http://x/api/integrations/connect/stripe", {
      method: "POST",
      body: JSON.stringify({ apiKey: "rk_test_ok" }),
    });
    const res = await POST(req, { params: Promise.resolve({ type: "stripe" }) });
    expect([200, 201]).toContain(res.status);
    expect(save).toHaveBeenCalledWith(
      "c1",
      "stripe",
      { apiKey: "rk_test_ok" },
      expect.objectContaining({ livemode: false }),
    );
  });

  it("returns 404 for an unknown integration type", async () => {
    const req = new Request("http://x/api/integrations/connect/nope", {
      method: "POST",
      body: JSON.stringify({ apiKey: "rk_test_ok" }),
    });
    const res = await POST(req, { params: Promise.resolve({ type: "nope" }) });
    expect(res.status).toBe(404);
    expect(save).not.toHaveBeenCalled();
  });

  it("returns 400 with the friendly error when validate fails", async () => {
    validate.mockResolvedValueOnce({ ok: false, error: "Invalid API key" });
    const req = new Request("http://x/api/integrations/connect/stripe", {
      method: "POST",
      body: JSON.stringify({ apiKey: "rk_test_bad" }),
    });
    const res = await POST(req, { params: Promise.resolve({ type: "stripe" }) });
    expect(res.status).toBe(400);
    expect(save).not.toHaveBeenCalled();
  });

  // ── C1.5 folded fixes ──────────────────────────────────────────────────────
  it("kicks off a backfill on connect (mode:backfill) and does NOT set lastSyncAt (fix A)", async () => {
    const req = new Request("http://x/api/integrations/connect/stripe", {
      method: "POST",
      body: JSON.stringify({ apiKey: "rk_test_ok" }),
    });
    await POST(req, { params: Promise.resolve({ type: "stripe" }) });

    // Backfill kicked off (fire-and-forget) with the right mode.
    expect(runIntegrationSync).toHaveBeenCalledWith("c1", "stripe", { mode: "backfill" });
    // Insert branch (no existing row) must NOT carry lastSyncAt — sync owns it now.
    expect(insertValues).toHaveBeenCalledTimes(1);
    expect(insertValues.mock.calls[0]?.[0]).not.toHaveProperty("lastSyncAt");
  });

  it("preserves existing metadata.sync on re-connect (fix B — merge, no lastSyncAt)", async () => {
    existingRow = {
      id: "i1",
      metadata: { livemode: false, sync: { cursor: 1700000000, lastRecordCount: 5 } },
    };
    const req = new Request("http://x/api/integrations/connect/stripe", {
      method: "POST",
      body: JSON.stringify({ apiKey: "rk_test_ok" }),
    });
    await POST(req, { params: Promise.resolve({ type: "stripe" }) });

    expect(updateSet).toHaveBeenCalledTimes(1);
    const set = updateSet.mock.calls[0]?.[0] as Record<string, unknown>;
    const meta = set.metadata as { livemode: boolean; sync: { cursor: number } };
    expect(meta.livemode).toBe(false);
    expect(meta.sync).toEqual({ cursor: 1700000000, lastRecordCount: 5 }); // sync NOT clobbered
    expect(set).not.toHaveProperty("lastSyncAt"); // connect is not syncing
  });
});
