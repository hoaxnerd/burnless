import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dbStatus, runMigrate } from "../local/db";

let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(join(os.tmpdir(), "bl-db-"));
  process.env.BURNLESS_DB_DRIVER = "pglite";
  process.env.BURNLESS_DATA_DIR = dataDir;
  delete process.env.DATABASE_URL;
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.BURNLESS_DB_DRIVER;
  delete process.env.BURNLESS_DATA_DIR;
});

describe("runMigrate", () => {
  it("applies the baseline to a fresh PGLite data dir and reports the driver", async () => {
    const result = await runMigrate();
    expect(result.driver).toBe("pglite");
    await expect(runMigrate()).resolves.toMatchObject({ driver: "pglite" });
  });
});

describe("dbStatus", () => {
  it("reports a reachable PGLite instance after migration", async () => {
    await runMigrate();
    const status = await dbStatus();
    expect(status.driver).toBe("pglite");
    expect(status.connected).toBe(true);
  });
});
