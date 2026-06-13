/**
 * Local-user row primitives (S5 P2) — shared by the web app wrappers AND the
 * burnless CLI. Real PGLite via the package's getTestDb harness; `db` in the
 * query module (which imports from "../index") is pointed at the test DB.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "@burnless/types";
import { getTestDb } from "./setup";

vi.mock("../index", () => ({
  get db() {
    return getTestDb();
  },
}));

import { companies, companyMembers, users } from "../schema";
import {
  createOwnerCompanyIfNone,
  createOwnerUserIfNone,
  createUser,
  getOwnerUser,
  isOwnerClaimed,
  listUsers,
  setUserPassword,
  LOCAL_OWNER_COMPANY_ID,
  LOCAL_OWNER_EMAIL,
  LOCAL_OWNER_ID,
} from "../queries/local-user";

beforeEach(async () => {
  // Single-tenant invariants under test require clean tables per test.
  // company_members + companies first (FK to users.id), then users.
  await getTestDb().delete(companyMembers);
  await getTestDb().delete(companies);
  await getTestDb().delete(users);
});

describe("createOwnerUserIfNone", () => {
  it("inserts the owner once, idempotently", async () => {
    await createOwnerUserIfNone();
    await createOwnerUserIfNone();
    const all = await listUsers();
    expect(all.length).toBe(1);
    expect(all[0]!.email).toBe(LOCAL_OWNER_EMAIL);
    expect(all[0]!.id).toBe(LOCAL_OWNER_ID);
    expect(all[0]!.claimed).toBe(false);
  });
});

describe("createOwnerCompanyIfNone", () => {
  it("inserts the install company + owner membership once, idempotently", async () => {
    await createOwnerUserIfNone();
    await createOwnerCompanyIfNone(LOCAL_OWNER_ID);
    await createOwnerCompanyIfNone(LOCAL_OWNER_ID);

    const db = getTestDb();
    const companyRows = await db.select().from(companies);
    expect(companyRows.length).toBe(1);
    expect(companyRows[0]!.id).toBe(LOCAL_OWNER_COMPANY_ID);
    expect(companyRows[0]!.name).toBe("My Company");
    expect(companyRows[0]!.ownerId).toBe(LOCAL_OWNER_ID);

    const memberRows = await db.select().from(companyMembers);
    expect(memberRows.length).toBe(1);
    expect(memberRows[0]!.companyId).toBe(LOCAL_OWNER_COMPANY_ID);
    expect(memberRows[0]!.userId).toBe(LOCAL_OWNER_ID);
    expect(memberRows[0]!.role).toBe("owner");
  });

  it("short-circuits when any membership already exists", async () => {
    await createOwnerUserIfNone();
    await createOwnerCompanyIfNone(LOCAL_OWNER_ID);
    // A second invocation must not create a second company even with a fresh id.
    await createOwnerCompanyIfNone(LOCAL_OWNER_ID);
    const companyRows = await getTestDb().select().from(companies);
    expect(companyRows.length).toBe(1);
  });
});

describe("getOwnerUser / isOwnerClaimed", () => {
  it("returns the owner and reflects claim state after a password is set", async () => {
    await createOwnerUserIfNone();
    expect(await isOwnerClaimed()).toBe(false);
    const owner = await getOwnerUser();
    expect(owner?.email).toBe(LOCAL_OWNER_EMAIL);
    await setUserPassword(LOCAL_OWNER_EMAIL, await hashPassword("secretpw"));
    expect(await isOwnerClaimed()).toBe(true);
    const all = await listUsers();
    expect(all[0]!.claimed).toBe(true);
  });
});

describe("createUser", () => {
  it("creates an additional claimed user with a random id", async () => {
    await createOwnerUserIfNone();
    await createUser({
      email: "team@example.com",
      name: "Teammate",
      passwordHash: await hashPassword("teampw"),
    });
    const all = await listUsers();
    expect(all.length).toBe(2);
    const team = all.find((u) => u.email === "team@example.com")!;
    expect(team.claimed).toBe(true);
    expect(team.id).not.toBe(LOCAL_OWNER_ID);
  });
});
