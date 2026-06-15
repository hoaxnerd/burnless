/**
 * Pre-save discovery route (#49 follow-up): POST /api/ai-features/providers/discover-models.
 * Takes {kind, baseUrl?, apiKey?} (NO saved provider id) so the modal's Fetch
 * button works before save. Keyless providers (OpenRouter/Ollama) return models
 * with no apiKey; key-required providers return a friendly error when none given.
 * Same gate chain as the saved-provider routes: requireCompanyAccess →
 * self-host gate (403 on cloud) → requireRole(admin). No DB writes.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { NextResponse } from "next/server";

const caps = { managedAiProvider: false } as Record<string, boolean>;
vi.mock("@/lib/capabilities", () => ({ getCapabilities: () => caps }));

const ctx = { userId: "u1", companyId: "c1", role: "admin" as string };
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

import { POST } from "../discover-models/route";

function req(body: unknown) {
  return new Request("http://t", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  caps.managedAiProvider = false;
  ctx.role = "admin";
  vi.restoreAllMocks();
});

describe("POST /api/ai-features/providers/discover-models", () => {
  it("returns models for a KEYLESS provider (OpenRouter) with NO apiKey", async () => {
    const spy = vi.fn(async () => ({ ok: true, json: async () => ({ data: [{ id: "openrouter/auto" }, { id: "anthropic/claude" }] }) }));
    vi.stubGlobal("fetch", spy as unknown as typeof fetch);
    const res = await POST(req({ kind: "openrouter" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.models.map((m: { modelId: string }) => m.modelId)).toEqual(["openrouter/auto", "anthropic/claude"]);
    // keyless: no Authorization header sent
    expect(spy).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/models",
      expect.objectContaining({ headers: {} }),
    );
  });

  it("returns a friendly error (not a raw 401) for a key-required provider with no apiKey", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })) as unknown as typeof fetch);
    const res = await POST(req({ kind: "openai" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/api key/i);
    expect(body.error).not.toMatch(/^HTTP|401/);
  });

  it("returns Anthropic's static catalog models with no apiKey (no fetch)", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy as unknown as typeof fetch);
    const res = await POST(req({ kind: "anthropic" }));
    expect(res.status).toBe(200);
    expect(spy).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.models.length).toBeGreaterThan(0);
    expect(body.models[0].source).toBe("preset");
  });

  it("403s on cloud (managedAiProvider ON)", async () => {
    caps.managedAiProvider = true;
    const res = await POST(req({ kind: "openrouter" }));
    expect(res.status).toBe(403);
  });

  it("403s for a non-admin role", async () => {
    ctx.role = "viewer";
    const res = await POST(req({ kind: "openrouter" }));
    expect(res.status).toBe(403);
  });

  it("400s on an invalid kind", async () => {
    const res = await POST(req({ kind: "not-a-provider" }));
    expect(res.status).toBe(400);
  });
});
