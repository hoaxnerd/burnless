import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db, users } from "@burnless/db";
import { LOCAL_OWNER_EMAIL, ensureLocalUser, getLocalOwner } from "../local-auth";

const ENV = { ...process.env };
function setEdition(deployment: "self_host" | "cloud") {
  process.env.BURNLESS_DEPLOYMENT = deployment;
  delete process.env.BURNLESS_CAP_AUTO_LOGIN;
}

beforeEach(async () => {
  await db.delete(users);
  setEdition("self_host");
});
afterEach(() => {
  process.env = { ...ENV };
});

describe("ensureLocalUser", () => {
  it("creates exactly one owner when autoLogin on + no users", async () => {
    await ensureLocalUser();
    const all = await db.select().from(users);
    expect(all).toHaveLength(1);
    expect(all[0]!.email).toBe(LOCAL_OWNER_EMAIL);
    expect(all[0]!.passwordHash).toBeNull(); // unclaimed
    expect(all[0]!.emailVerified).not.toBeNull();
  });

  it("is idempotent (second call no-op)", async () => {
    await ensureLocalUser();
    await ensureLocalUser();
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it("no-ops when a user already exists", async () => {
    await db.insert(users).values({ email: "real@example.com", name: "Real" });
    await ensureLocalUser();
    const all = await db.select().from(users);
    expect(all).toHaveLength(1);
    expect(all[0]!.email).toBe("real@example.com");
  });

  it("no-ops on cloud (autoLogin off)", async () => {
    setEdition("cloud");
    await ensureLocalUser();
    expect(await db.select().from(users)).toHaveLength(0);
  });
});

describe("getLocalOwner", () => {
  it("returns the oldest user (stable across email/password claim)", async () => {
    await ensureLocalUser();
    const [created] = await db.select().from(users);
    // simulate a later, second user (e.g. future CLI users create)
    await db.insert(users).values({ email: "later@example.com", name: "Later" });
    const owner = await getLocalOwner();
    expect(owner?.id).toBe(created!.id);

    // claim: change email + set password on the SAME row → still the owner
    await db.update(users).set({ email: "me@real.com", passwordHash: "pbkdf2:..." })
      .where((await import("drizzle-orm")).eq(users.id, created!.id));
    expect((await getLocalOwner())?.id).toBe(created!.id);
  });

  it("returns null when no users", async () => {
    expect(await getLocalOwner()).toBeNull();
  });
});
