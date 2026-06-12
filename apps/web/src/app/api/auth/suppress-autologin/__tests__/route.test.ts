import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextResponse } from "next/server";
import { db, users } from "@burnless/db";
import { NO_AUTOLOGIN_COOKIE } from "@/lib/auto-login";

let sessionUserId: string | null = null;

// Explicit factory (claim-route convention): the real @/lib/api-helpers imports
// ./auth (NextAuth), which does not resolve under vitest. Stub getAuthUser only;
// the DB flow stays real (PGLite). Contract identical to the real helper.
vi.mock("@/lib/api-helpers", () => ({
  getAuthUser: async () => (sessionUserId ? { id: sessionUserId, email: "owner@localhost" } : null),
  errorResponse: (msg: string, status: number) => NextResponse.json({ error: msg }, { status }),
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));

beforeEach(async () => {
  await db.delete(users);
});
afterEach(() => { sessionUserId = null; vi.restoreAllMocks(); });

async function suppress() {
  const { POST } = await import("../route");
  return POST();
}

describe("POST /api/auth/suppress-autologin", () => {
  it("claimed user → 200 + sets the suppression cookie", async () => {
    const [u] = await db
      .insert(users)
      .values({ email: "owner@localhost", name: "Owner", passwordHash: "pbkdf2:x" })
      .returning();
    sessionUserId = u!.id;
    const res = await suppress();
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${NO_AUTOLOGIN_COOKIE}=1`);
    expect(setCookie.toLowerCase()).toContain("httponly");
  });

  it("401 when unauthenticated", async () => {
    sessionUserId = null;
    const res = await suppress();
    expect(res.status).toBe(401);
  });

  it("403 when authenticated but unclaimed (no password)", async () => {
    const [u] = await db
      .insert(users)
      .values({ email: "owner@localhost", name: "Owner" })
      .returning();
    sessionUserId = u!.id;
    const res = await suppress();
    expect(res.status).toBe(403);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).not.toContain(`${NO_AUTOLOGIN_COOKIE}=1`);
  });
});
