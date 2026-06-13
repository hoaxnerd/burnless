import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.BURNLESS_DB_DRIVER;
  delete process.env.BURNLESS_DATA_DIR;
  delete process.env.SECRETS_ENCRYPTION_KEY;
});

describe("runBootstrap", () => {
  it("generates the key and migrates, returning a summary", async () => {
    const result = await runBootstrap({ home });
    expect(result.driver).toBe("pglite");
    expect(result.keyGenerated).toBe(true);
    expect(readInstanceEnv(home).SECRETS_ENCRYPTION_KEY).toBeDefined();
  });
});
