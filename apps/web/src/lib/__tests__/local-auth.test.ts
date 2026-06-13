import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db, users, companies, companyMembers, LOCAL_OWNER_COMPANY_ID } from "@burnless/db";
import { LOCAL_OWNER_EMAIL, ensureLocalUser, ensureLocalCompany, getLocalOwner } from "../local-auth";

const ENV = { ...process.env };
function setEdition(deployment: "self_host" | "cloud") {
  process.env.BURNLESS_DEPLOYMENT = deployment;
  delete process.env.BURNLESS_CAP_AUTO_LOGIN;
}

beforeEach(async () => {
  // FK order: members → companies → users.
  await db.delete(companyMembers);
  await db.delete(companies);
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

describe("ensureLocalCompany", () => {
  it("creates the install company + owner membership when autoLogin on + owner exists", async () => {
    await ensureLocalUser();
    const owner = await getLocalOwner();
    await ensureLocalCompany();

    const allCompanies = await db.select().from(companies);
    expect(allCompanies).toHaveLength(1);
    expect(allCompanies[0]!.id).toBe(LOCAL_OWNER_COMPANY_ID);
    expect(allCompanies[0]!.name).toBe("My Company");
    expect(allCompanies[0]!.ownerId).toBe(owner!.id);

    const members = await db.select().from(companyMembers);
    expect(members).toHaveLength(1);
    expect(members[0]!.companyId).toBe(LOCAL_OWNER_COMPANY_ID);
    expect(members[0]!.userId).toBe(owner!.id);
    expect(members[0]!.role).toBe("owner");
  });

  it("is idempotent (second call no-op)", async () => {
    await ensureLocalUser();
    await ensureLocalCompany();
    await ensureLocalCompany();
    expect(await db.select().from(companies)).toHaveLength(1);
    expect(await db.select().from(companyMembers)).toHaveLength(1);
  });

  it("no-ops on cloud (autoLogin off) — never auto-creates a company", async () => {
    await ensureLocalUser(); // no-op on cloud anyway, but be explicit
    setEdition("cloud");
    await ensureLocalCompany();
    expect(await db.select().from(companies)).toHaveLength(0);
    expect(await db.select().from(companyMembers)).toHaveLength(0);
  });

  it("no-ops when no owner user exists (defensive null-owner guard)", async () => {
    // autoLogin on, but no user — should not throw, should not create a company.
    await ensureLocalCompany();
    expect(await db.select().from(companies)).toHaveLength(0);
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
