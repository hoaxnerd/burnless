import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  closeDatabase,
  getCompanyForUser,
  getOwnerUser,
  initDatabase,
  LOCAL_OWNER_COMPANY_ID,
} from "@burnless/db";
import { runBootstrap } from "../commands/bootstrap";
import { readInstanceEnv } from "../local/home";

let home: string;
let dataDir: string;
beforeEach(() => {
  home = mkdtempSync(join(os.tmpdir(), "bl-bs-home-"));
  dataDir = mkdtempSync(join(os.tmpdir(), "bl-bs-data-"));
  process.env.BURNLESS_DB_DRIVER = "pglite";
  process.env.BURNLESS_DATA_DIR = dataDir;
  delete process.env.DATABASE_URL;
  delete process.env.SECRETS_ENCRYPTION_KEY;
  delete process.env.BURNLESS_DEPLOYMENT;
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.BURNLESS_DB_DRIVER;
  delete process.env.BURNLESS_DATA_DIR;
  delete process.env.SECRETS_ENCRYPTION_KEY;
  delete process.env.BURNLESS_DEPLOYMENT;
});

describe("runBootstrap", () => {
  it("generates the key and migrates, returning a summary", async () => {
    const result = await runBootstrap({ home });
    expect(result.driver).toBe("pglite");
    expect(result.keyGenerated).toBe(true);
    expect(readInstanceEnv(home).SECRETS_ENCRYPTION_KEY).toBeDefined();
  });

  it("self-host: creates the owner user + install company so `provider add` works immediately", async () => {
    await runBootstrap({ home });
    await initDatabase();
    try {
      const owner = await getOwnerUser();
      expect(owner).not.toBeNull();
      const membership = await getCompanyForUser(owner!.id);
      expect(membership).not.toBeNull();
      expect(membership!.companyId).toBe(LOCAL_OWNER_COMPANY_ID);
      expect(membership!.role).toBe("owner");
    } finally {
      await closeDatabase();
    }
  });

  it("self-host: is idempotent across repeated bootstraps (one user, one company)", async () => {
    await runBootstrap({ home });
    await runBootstrap({ home });
    await initDatabase();
    try {
      const { db, users, companies } = await import("@burnless/db");
      const userRows = await db.select({ id: users.id }).from(users);
      const companyRows = await db.select({ id: companies.id }).from(companies);
      expect(userRows.length).toBe(1);
      expect(companyRows.length).toBe(1);
    } finally {
      await closeDatabase();
    }
  });

  it("cloud: does NOT auto-create a user or company (users self-serve via signup)", async () => {
    process.env.BURNLESS_DEPLOYMENT = "cloud";
    await runBootstrap({ home });
    await initDatabase();
    try {
      const owner = await getOwnerUser();
      expect(owner).toBeNull();
    } finally {
      await closeDatabase();
    }
  });
});
