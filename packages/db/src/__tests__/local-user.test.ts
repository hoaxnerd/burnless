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

import { users } from "../schema";
import {
  createOwnerUserIfNone,
  createUser,
  getOwnerUser,
  isOwnerClaimed,
  listUsers,
  setUserPassword,
  LOCAL_OWNER_EMAIL,
  LOCAL_OWNER_ID,
} from "../queries/local-user";

beforeEach(async () => {
  // Single-user invariants under test require a clean users table per test.
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
