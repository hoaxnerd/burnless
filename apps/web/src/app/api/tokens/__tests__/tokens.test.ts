/**
 * PAT routes (spec §5.1): GET lists own active tokens (no hash leakage),
 * POST mints with role-capped scopes + returns plaintext ONCE,
 * DELETE revokes own token. Real PGLite db; only the session is mocked.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { NextResponse } from "next/server";
import { createUser, createCompany, createMember } from "@db-test/factories";

const { mockRequireCompanyAccess } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
}));

// Note: importOriginal cannot be used here because api-helpers transitively
// imports next-auth which is unavailable in the test environment. We provide
// real implementations of parseBody and errorResponse inline.
vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
  errorResponse: (msg: string, status: number) =>
    new NextResponse(JSON.stringify({ error: msg }), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  parseBody: async (request: Request, schema: { parse: (d: unknown) => unknown }) => {
    const { NextResponse } = await import("next/server");
    try {
      const body = await request.json();
      return { data: schema.parse(body) };
    } catch (e: unknown) {
      const msg =
        e instanceof Error && e.name === "ZodError"
          ? (e as { errors?: { message: string }[] }).errors
              ?.map((issue) => issue.message)
              .join("; ") ?? "Invalid request body"
          : "Invalid request body";
      return {
        error: NextResponse.json({ error: msg }, { status: 400 }),
      };
    }
  },
}));

import { GET, POST } from "../route";
import { DELETE } from "../[id]/route";

function jsonRequest(method: string, body?: unknown): Request {
  return new Request("http://localhost:3000/api/tokens", {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

let ownerCtx: { userId: string; companyId: string; role: string };
let viewerCtx: { userId: string; companyId: string; role: string };

beforeAll(async () => {
  const owner = await createUser();
  const company = await createCompany(owner.id);
  await createMember(company.id, owner.id, { role: "owner" });
  const viewer = await createUser();
  await createMember(company.id, viewer.id, { role: "viewer" });
  ownerCtx = { userId: owner.id, companyId: company.id, role: "owner" };
  viewerCtx = { userId: viewer.id, companyId: company.id, role: "viewer" };
});

describe("POST /api/tokens", () => {
  it("mints a token, returns plaintext once, never returns the hash", async () => {
    mockRequireCompanyAccess.mockResolvedValue(ownerCtx);
    const res = (await POST(
      jsonRequest("POST", { name: "Claude Desktop", scopes: ["read", "write"], expiresInDays: 60 })
    )) as NextResponse;
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.token).toMatch(/^bl_pat_/);
    expect(body.lastFour).toBe(body.token.slice(-4));
    expect(body.scopes).toEqual(["read", "write"]);
    expect(body.expiresAt).not.toBeNull();
    expect(body.tokenHash).toBeUndefined();
  });

  it("rejects scopes above the caller's role cap (viewer minting write → 403)", async () => {
    mockRequireCompanyAccess.mockResolvedValue(viewerCtx);
    const res = (await POST(
      jsonRequest("POST", { name: "Sneaky", scopes: ["read", "write"] })
    )) as NextResponse;
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("write");
  });

  it("viewer CAN mint a read-only token", async () => {
    mockRequireCompanyAccess.mockResolvedValue(viewerCtx);
    const res = (await POST(
      jsonRequest("POST", { name: "Viewer read", scopes: ["read"] })
    )) as NextResponse;
    expect(res.status).toBe(201);
  });

  it("validates the body (empty scopes → 400)", async () => {
    mockRequireCompanyAccess.mockResolvedValue(ownerCtx);
    const res = (await POST(jsonRequest("POST", { name: "Bad", scopes: [] }))) as NextResponse;
    expect(res.status).toBe(400);
  });
});

describe("GET /api/tokens", () => {
  it("lists only the caller's active tokens, masked", async () => {
    mockRequireCompanyAccess.mockResolvedValue(ownerCtx);
    const res = (await GET()) as NextResponse;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    for (const t of body) {
      expect(t.token).toBeUndefined();
      expect(t.tokenHash).toBeUndefined();
      expect(t.lastFour).toMatch(/^.{4}$/);
    }
  });
});

describe("DELETE /api/tokens/[id]", () => {
  it("revokes the caller's own token; 404 for someone else's", async () => {
    mockRequireCompanyAccess.mockResolvedValue(ownerCtx);
    const minted = (await POST(
      jsonRequest("POST", { name: "To revoke", scopes: ["read"] })
    )) as NextResponse;
    const { id } = await minted.json();

    // viewer cannot revoke the owner's token
    mockRequireCompanyAccess.mockResolvedValue(viewerCtx);
    const forbidden = (await DELETE(jsonRequest("DELETE"), {
      params: Promise.resolve({ id }),
    })) as NextResponse;
    expect(forbidden.status).toBe(404);

    mockRequireCompanyAccess.mockResolvedValue(ownerCtx);
    const ok = (await DELETE(jsonRequest("DELETE"), {
      params: Promise.resolve({ id }),
    })) as NextResponse;
    expect(ok.status).toBe(200);

    const again = (await DELETE(jsonRequest("DELETE"), {
      params: Promise.resolve({ id }),
    })) as NextResponse;
    expect(again.status).toBe(404);
  });
});
