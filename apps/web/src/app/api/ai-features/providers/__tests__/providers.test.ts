/**
 * Provider config API (P2 sub-project #49, task 7). Real PGLite db (createAiProvider
 * FK → companies); only api-helpers (session) + capabilities are mocked. Routes:
 * GET/POST /api/ai-features/providers, PATCH/DELETE /[id], POST /[id]/default.
 * ALL: requireCompanyAccess → self-host gate (403 on cloud) → requireRole(admin) → never leak secrets.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { NextResponse } from "next/server";
import { createUser, createCompany } from "@db-test/factories";

// Capability mock — flip managedAiProvider to simulate cloud (ON) vs self-host (OFF).
const caps = { managedAiProvider: false } as Record<string, boolean>;
vi.mock("@/lib/capabilities", () => ({ getCapabilities: () => caps }));

// requireCompanyAccess mock — points at a seeded company. Real impls for the rest
// (importOriginal is unusable here: api-helpers transitively imports next-auth).
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

import { GET, POST } from "../route";
import { PATCH, DELETE } from "../[id]/route";
import { POST as SET_DEFAULT } from "../[id]/default/route";

beforeAll(async () => {
  process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
  const user = await createUser();
  const company = await createCompany(user.id);
  ctx.userId = user.id;
  ctx.companyId = company.id;
  ctx.role = "admin";
});

function jreq(body: unknown) {
  return new Request("http://t/api/ai-features/providers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("providers config API", () => {
  it("POST creates a provider; GET lists it with the key masked", async () => {
    caps.managedAiProvider = false;
    const created = await POST(jreq({ name: "OR", kind: "openrouter", apiKey: "sk-secret" }));
    expect(created.status).toBe(201);
    const listRes = await GET();
    const list = await listRes.json();
    expect(list.providers.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(list)).not.toContain("sk-secret");
    expect(list.providers.some((p: { apiKeySet: boolean }) => p.apiKeySet)).toBe(true);
  });

  it("403s on cloud (managedAiProvider ON)", async () => {
    caps.managedAiProvider = true;
    expect((await POST(jreq({ name: "x", kind: "openai", apiKey: "k" }))).status).toBe(403);
    expect((await GET()).status).toBe(403);
    caps.managedAiProvider = false;
  });

  it("403s for a viewer", async () => {
    ctx.role = "viewer";
    expect((await POST(jreq({ name: "x", kind: "openai", apiKey: "k" }))).status).toBe(403);
    ctx.role = "admin";
  });

  it("PATCH renames; DELETE removes", async () => {
    const created = await (await POST(jreq({ name: "A", kind: "openai", apiKey: "k" }))).json();
    const id = created.provider.id;
    const patched = await PATCH(
      new Request(`http://t/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "B" }),
      }),
      { params: Promise.resolve({ id }) }
    );
    expect((await patched.json()).provider.name).toBe("B");
    const del = await DELETE(new Request("http://t", { method: "DELETE" }), {
      params: Promise.resolve({ id }),
    });
    expect(del.status).toBe(200);
  });

  it("POST /[id]/default sets the default provider", async () => {
    const created = await (await POST(jreq({ name: "D", kind: "openai", apiKey: "k" }))).json();
    const id = created.provider.id;
    const res = await SET_DEFAULT(new Request("http://t", { method: "POST" }), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it("default 403s for a viewer", async () => {
    const created = await (await POST(jreq({ name: "DV", kind: "openai", apiKey: "k" }))).json();
    const id = created.provider.id;
    ctx.role = "viewer";
    const res = await SET_DEFAULT(new Request("http://t", { method: "POST" }), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(403);
    ctx.role = "admin";
  });

  it("PATCH/DELETE 404 for an unknown id", async () => {
    const missing = "00000000-0000-0000-0000-000000000000";
    const patched = await PATCH(
      new Request("http://t", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Z" }),
      }),
      { params: Promise.resolve({ id: missing }) }
    );
    expect(patched.status).toBe(404);
    const del = await DELETE(new Request("http://t", { method: "DELETE" }), {
      params: Promise.resolve({ id: missing }),
    });
    expect(del.status).toBe(404);
  });

  it("rejects an invalid kind with 400", async () => {
    expect((await POST(jreq({ name: "x", kind: "not-a-kind", apiKey: "k" }))).status).toBe(400);
  });
});
