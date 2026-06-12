import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextResponse } from "next/server";
import { db, users } from "@burnless/db";

let sessionUserId: string | null = null;

// Explicit factory (option-pools convention): the real @/lib/api-helpers imports
// ./auth (NextAuth), which does not resolve under vitest. Re-implement the exact
// helper shapes the route uses; getAuthUser is the only stubbed behavior. The DB
// flow stays real (PGLite). Contract identical to the real helpers.
vi.mock("@/lib/api-helpers", () => ({
  getAuthUser: async () => (sessionUserId ? { id: sessionUserId, email: "owner@localhost" } : null),
  errorResponse: (msg: string, status: number) => NextResponse.json({ error: msg }, { status }),
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));

beforeEach(async () => { await db.delete(users); });
afterEach(() => { sessionUserId = null; vi.restoreAllMocks(); });

async function get() {
  const { GET } = await import("../route");
  return GET();
}

describe("GET /api/auth/account-status", () => {
  it("isClaimed false when no password", async () => {
    const [u] = await db.insert(users).values({ email: "owner@localhost", name: "Owner" }).returning();
    sessionUserId = u!.id;
    const body = await (await get()).json();
    expect(body).toEqual({ email: "owner@localhost", isClaimed: false });
  });
  it("isClaimed true when password set", async () => {
    const [u] = await db.insert(users).values({ email: "me@x.com", name: "Me", passwordHash: "pbkdf2:x" }).returning();
    sessionUserId = u!.id;
    const body = await (await get()).json();
    expect(body.isClaimed).toBe(true);
  });
  it("401 unauthenticated", async () => {
    sessionUserId = null;
    expect((await get()).status).toBe(401);
  });
});
