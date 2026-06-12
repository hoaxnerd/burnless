import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextResponse } from "next/server";
import { db, users } from "@burnless/db";
import { eq } from "drizzle-orm";

const ENV = { ...process.env };
let sessionUserId: string | null = null;

// Explicit factory (option-pools convention): the real @/lib/api-helpers imports
// ./auth (NextAuth), which does not resolve under vitest. Re-implement the exact
// helper shapes the route uses; getAuthUser is the only stubbed behavior. The DB
// flow stays real (PGLite). Contract identical to the real helpers.
vi.mock("@/lib/api-helpers", () => ({
  getAuthUser: async () => (sessionUserId ? { id: sessionUserId, email: "owner@localhost" } : null),
  errorResponse: (msg: string, status: number) => NextResponse.json({ error: msg }, { status }),
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
  parseBody: async (req: Request, schema: { parse: (d: unknown) => unknown }) => {
    try {
      return { data: schema.parse(await req.json()) };
    } catch {
      return { error: NextResponse.json({ error: "Validation failed" }, { status: 400 }) };
    }
  },
}));

beforeEach(async () => {
  await db.delete(users);
  process.env.BURNLESS_DEPLOYMENT = "self_host";
  delete process.env.BURNLESS_CAP_AUTO_LOGIN;
});
afterEach(() => { process.env = { ...ENV }; sessionUserId = null; vi.restoreAllMocks(); });

async function claim(body: unknown) {
  const { POST } = await import("../route");
  return POST(new Request("http://localhost/api/auth/claim", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
}

describe("POST /api/auth/claim", () => {
  it("sets password + email on the unclaimed owner", async () => {
    const [u] = await db.insert(users).values({ email: "owner@localhost", name: "Owner" }).returning();
    sessionUserId = u!.id;
    const res = await claim({ email: "me@real.com", password: "Abcdef12" });
    expect(res.status).toBe(200);
    const [after] = await db.select().from(users).where(eq(users.id, u!.id));
    expect(after!.email).toBe("me@real.com");
    expect(after!.passwordHash).toBeTruthy();
  });

  it("409 when already claimed (password already set)", async () => {
    const [u] = await db.insert(users).values({ email: "owner@localhost", name: "Owner", passwordHash: "pbkdf2:x" }).returning();
    sessionUserId = u!.id;
    expect((await claim({ email: "me@real.com", password: "Abcdef12" })).status).toBe(409);
  });

  it("409 on email collision with another user", async () => {
    await db.insert(users).values({ email: "taken@x.com", name: "Other" });
    const [u] = await db.insert(users).values({ email: "owner@localhost", name: "Owner" }).returning();
    sessionUserId = u!.id;
    expect((await claim({ email: "taken@x.com", password: "Abcdef12" })).status).toBe(409);
  });

  it("401 when unauthenticated", async () => {
    sessionUserId = null;
    expect((await claim({ email: "me@real.com", password: "Abcdef12" })).status).toBe(401);
  });

  it("400 on weak password", async () => {
    const [u] = await db.insert(users).values({ email: "owner@localhost", name: "Owner" }).returning();
    sessionUserId = u!.id;
    expect((await claim({ email: "me@real.com", password: "weak" })).status).toBe(400);
  });
});
