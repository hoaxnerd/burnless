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
const { save, validate, getCapabilities } = vi.hoisted(() => ({
  save: vi.fn(async () => {}),
  validate: vi.fn(async () => ({ ok: true, livemode: false }) as unknown),
  getCapabilities: vi.fn(() => ({ planEnforcement: false })),
}));

// planEnforcement OFF by default (self-host) — connect must NOT be blocked.
vi.mock("@/lib/capabilities", () => ({
  requireCapability: vi.fn(() => null),
  getCapabilities: () => getCapabilities(),
}));

vi.mock("@burnless/db", () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => [] }) }),
    }),
    insert: () => ({
      values: () => ({ returning: async () => [{ id: "i1", type: "stripe", status: "active" }] }),
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

describe("POST /api/integrations/[type]/connect", () => {
  beforeEach(() => {
    save.mockClear();
    validate.mockClear();
    getCapabilities.mockReturnValue({ planEnforcement: false });
  });

  it("validates the key, stores encrypted creds, upserts the row, returns 200", async () => {
    const req = new Request("http://x/api/integrations/stripe/connect", {
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
    const req = new Request("http://x/api/integrations/nope/connect", {
      method: "POST",
      body: JSON.stringify({ apiKey: "rk_test_ok" }),
    });
    const res = await POST(req, { params: Promise.resolve({ type: "nope" }) });
    expect(res.status).toBe(404);
    expect(save).not.toHaveBeenCalled();
  });

  it("returns 400 with the friendly error when validate fails", async () => {
    validate.mockResolvedValueOnce({ ok: false, error: "Invalid API key" });
    const req = new Request("http://x/api/integrations/stripe/connect", {
      method: "POST",
      body: JSON.stringify({ apiKey: "rk_test_bad" }),
    });
    const res = await POST(req, { params: Promise.resolve({ type: "stripe" }) });
    expect(res.status).toBe(400);
    expect(save).not.toHaveBeenCalled();
  });
});
