import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextResponse } from "next/server";
import { db, users } from "@burnless/db";
import { eq } from "drizzle-orm";

const ENV = { ...process.env };
let sessionUserId: string | null = null;

// Explicit factory (claim-route convention): the real @/lib/api-helpers imports
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
  delete process.env.BURNLESS_CAP_EMAIL_VERIFICATION;
  delete process.env.EMAIL_PROVIDER;
});
afterEach(() => { process.env = { ...ENV }; sessionUserId = null; vi.restoreAllMocks(); });

async function changeEmail(body: unknown) {
  const { POST } = await import("../route");
  return POST(new Request("http://localhost/api/auth/change-email", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
}

describe("POST /api/auth/change-email", () => {
  it("updates the email", async () => {
    const [u] = await db.insert(users).values({ email: "owner@localhost", name: "Owner" }).returning();
    sessionUserId = u!.id;
    expect((await changeEmail({ email: "new@x.com" })).status).toBe(200);
    const [after] = await db.select().from(users).where(eq(users.id, u!.id));
    expect(after!.email).toBe("new@x.com");
  });

  it("409 on collision", async () => {
    await db.insert(users).values({ email: "taken@x.com", name: "Other" });
    const [u] = await db.insert(users).values({ email: "owner@localhost", name: "Owner" }).returning();
    sessionUserId = u!.id;
    expect((await changeEmail({ email: "taken@x.com" })).status).toBe(409);
  });

  it("401 unauthenticated", async () => {
    sessionUserId = null;
    expect((await changeEmail({ email: "new@x.com" })).status).toBe(401);
  });

  it("resets emailVerified only when emailVerification is on (cloud)", async () => {
    const [u] = await db.insert(users).values({ email: "owner@localhost", name: "Owner", emailVerified: new Date() }).returning();
    sessionUserId = u!.id;
    // Force the emailVerification capability on. It auto-degrades off without an
    // email provider, so cloud edition alone is not enough — also stub a provider.
    process.env.BURNLESS_DEPLOYMENT = "cloud";
    process.env.EMAIL_PROVIDER = "console";
    await changeEmail({ email: "new@x.com" });
    const [after] = await db.select().from(users).where(eq(users.id, u!.id));
    expect(after!.emailVerified).toBeNull();
  });
});
