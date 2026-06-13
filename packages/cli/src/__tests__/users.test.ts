import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, initDatabase, isOwnerClaimed, listUsers } from "@burnless/db";
import { verifyPassword } from "@burnless/types";
import { runUsersCreate, runUsersList, runUsersPasswd } from "../commands/users";

let dataDir: string;
beforeEach(async () => {
  dataDir = mkdtempSync(join(os.tmpdir(), "bl-users-"));
  process.env.BURNLESS_DB_DRIVER = "pglite";
  process.env.BURNLESS_DATA_DIR = dataDir;
  delete process.env.DATABASE_URL;
  await initDatabase();
});
afterEach(async () => {
  await closeDatabase();
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.BURNLESS_DB_DRIVER;
  delete process.env.BURNLESS_DATA_DIR;
});

describe("runUsersPasswd", () => {
  it("claims the owner by setting a password (default target = owner)", async () => {
    const { createOwnerUserIfNone, LOCAL_OWNER_EMAIL } = await import("@burnless/db");
    await createOwnerUserIfNone();
    expect(await isOwnerClaimed()).toBe(false);
    await runUsersPasswd({ email: undefined, password: "newpassw0rd" });
    expect(await isOwnerClaimed()).toBe(true);
    const all = await listUsers();
    expect(all.find((u) => u.email === LOCAL_OWNER_EMAIL)!.claimed).toBe(true);
  });

  it("throws when the target user does not exist", async () => {
    await expect(runUsersPasswd({ email: "ghost@x.com", password: "p" })).rejects.toThrow();
  });
});

describe("runUsersCreate", () => {
  it("creates a claimed user whose password verifies", async () => {
    const { id } = await runUsersCreate({ email: "team@x.com", name: "T", password: "teampw" });
    expect(id).toBeTruthy();
    const all = await listUsers();
    expect(all.some((u) => u.email === "team@x.com" && u.claimed)).toBe(true);
    const { db, users } = await import("@burnless/db");
    const { eq } = await import("drizzle-orm");
    const [row] = await db.select({ h: users.passwordHash }).from(users).where(eq(users.email, "team@x.com"));
    expect(await verifyPassword("teampw", row!.h!)).toBe(true);
  });
});

describe("runUsersList", () => {
  it("returns user summaries", async () => {
    const { createOwnerUserIfNone } = await import("@burnless/db");
    await createOwnerUserIfNone();
    const rows = await runUsersList();
    expect(rows.length).toBe(1);
    expect(rows[0]!.claimed).toBe(false);
  });
});
