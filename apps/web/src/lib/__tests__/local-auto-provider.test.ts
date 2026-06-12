import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db, users } from "@burnless/db";

const ENV = { ...process.env };
beforeEach(async () => {
  await db.delete(users);
  process.env.BURNLESS_DEPLOYMENT = "self_host";
  delete process.env.BURNLESS_CAP_AUTO_LOGIN;
});
afterEach(() => { process.env = { ...ENV }; vi.restoreAllMocks(); });

/**
 * Provider-object-shape finding: NextAuth's `Credentials({ id, ... })` does NOT
 * expose the custom `id`/`authorize` at the top level — `provider.id` is always
 * the literal "credentials", and the custom `id` + `authorize` live under
 * `provider.options`. So we locate the provider by `options.id === "local-auto"`
 * and invoke `options.authorize`. Contract asserted is identical to the plan:
 * an authorize that returns the owner only when autoLogin is on.
 */
async function getAuthorize() {
  const { authConfig } = await import("../auth.config");
  const provider = (authConfig.providers as Array<{
    options?: { id?: string; authorize?: (c: unknown) => Promise<unknown> };
  }>).find((p) => p.options?.id === "local-auto");
  expect(provider, "local-auto provider must be registered").toBeTruthy();
  return provider!.options!.authorize!;
}

describe("local-auto provider", () => {
  it("returns the owner when autoLogin on + a user exists", async () => {
    await db.insert(users).values({ email: "owner@localhost", name: "Owner" });
    const authorize = await getAuthorize();
    const res = (await authorize({})) as { email: string } | null;
    expect(res?.email).toBe("owner@localhost");
  });

  it("returns null when no users", async () => {
    const authorize = await getAuthorize();
    expect(await authorize({})).toBeNull();
  });

  it("returns null on cloud (autoLogin off) even if a user exists", async () => {
    await db.insert(users).values({ email: "owner@localhost", name: "Owner" });
    process.env.BURNLESS_DEPLOYMENT = "cloud";
    const authorize = await getAuthorize();
    expect(await authorize({})).toBeNull();
  });
});
