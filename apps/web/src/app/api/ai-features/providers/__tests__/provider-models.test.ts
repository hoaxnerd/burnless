/**
 * Provider model + test-connection routes (P2 sub-project #49, task 8). Real PGLite db;
 * api-helpers (session) + capabilities mocked, @burnless/ai stubbed for the test route.
 * Routes: POST /[id]/models (manual add), POST /[id]/models/fetch (discovery upsert),
 * POST /[id]/test (live completion). ALL: requireCompanyAccess → self-host gate (403 cloud)
 * → requireRole(admin) → getAiProvider 404 → work. Secrets never returned.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { NextResponse } from "next/server";
import { createUser, createCompany } from "@db-test/factories";

const caps = { managedAiProvider: false } as Record<string, boolean>;
vi.mock("@/lib/capabilities", () => ({ getCapabilities: () => caps }));

// requireCompanyAccess mock — points at a seeded company. Real impls for the rest
// are inlined (importOriginal is unusable: api-helpers transitively imports next-auth).
const ctx = { userId: "", companyId: "", role: "admin" as string };
const ROLE_LEVEL: Record<string, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };
vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: vi.fn(async () =>
    ctx.companyId ? ctx : { error: NextResponse.json({ error: "no company" }, { status: 403 }) }
  ),
  requireRole: (c: { role: string }, min: string) =>
    (ROLE_LEVEL[c.role] ?? -1) < (ROLE_LEVEL[min] ?? 99)
      ? NextResponse.json({ error: `Forbidden: requires ${min} role or higher` }, { status: 403 })
      : null,
  errorResponse: (msg: string, status: number) => NextResponse.json({ error: msg }, { status }),
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));

import { createAiProvider, listAiProviderModels, addAiProviderModel, __resetSecretsKeyCache } from "@burnless/db";
import { POST as ADD_MODEL } from "../[id]/models/route";
import { POST as FETCH_MODELS } from "../[id]/models/fetch/route";

beforeAll(async () => {
  process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 2).toString("base64");
  __resetSecretsKeyCache();
  const user = await createUser();
  const company = await createCompany(user.id);
  ctx.userId = user.id; ctx.companyId = company.id; ctx.role = "admin";
});

describe("provider model routes", () => {
  it("manually adds a model", async () => {
    caps.managedAiProvider = false;
    const p = await createAiProvider({ companyId: ctx.companyId, name: "A", kind: "openai", apiKey: "k" });
    const res = await ADD_MODEL(new Request("http://t", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ modelId: "gpt-4o" }) }), { params: Promise.resolve({ id: p.id }) });
    expect(res.status).toBe(201);
    expect((await listAiProviderModels(p.id)).map((m) => m.modelId)).toContain("gpt-4o");
  });
  it("GET lists a provider's models", async () => {
    caps.managedAiProvider = false;
    const p = await createAiProvider({ companyId: ctx.companyId, name: "Gj", kind: "openai", apiKey: "k" });
    await addAiProviderModel(p.id, { modelId: "gpt-4o", source: "manual" });
    const { GET } = await import("../[id]/models/route");
    const res = await GET(new Request("http://t", { method: "GET" }), { params: Promise.resolve({ id: p.id }) });
    expect(res.status).toBe(200);
    expect((await res.json()).models.map((m: { modelId: string }) => m.modelId)).toContain("gpt-4o");
  });
  it("fetches + upserts discovered models", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }] }) })) as unknown as typeof fetch);
    const p = await createAiProvider({ companyId: ctx.companyId, name: "B", kind: "openai", apiKey: "k" });
    const res = await FETCH_MODELS(new Request("http://t", { method: "POST" }), { params: Promise.resolve({ id: p.id }) });
    expect(res.status).toBe(200);
    expect((await listAiProviderModels(p.id)).length).toBeGreaterThanOrEqual(2);
    vi.restoreAllMocks();
  });
  it("model routes 403 on cloud", async () => {
    caps.managedAiProvider = true;
    const res = await ADD_MODEL(new Request("http://t", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ modelId: "x" }) }), { params: Promise.resolve({ id: "any" }) });
    expect(res.status).toBe(403);
    caps.managedAiProvider = false;
  });
  it("404s for an unknown provider id", async () => {
    const res = await ADD_MODEL(new Request("http://t", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ modelId: "x" }) }), { params: Promise.resolve({ id: "does-not-exist" }) });
    expect(res.status).toBe(404);
  });
});
