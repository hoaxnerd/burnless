import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, createOwnerUserIfNone, initDatabase, LOCAL_OWNER_EMAIL, setUserPassword } from "@burnless/db";
import { hashPassword } from "@burnless/types";
import { runConfigGet, runConfigList, runConfigSet, runConfigUnset } from "../commands/config";

let home: string;
let dataDir: string;
beforeEach(() => {
  home = mkdtempSync(join(os.tmpdir(), "bl-cfg-home-"));
  dataDir = mkdtempSync(join(os.tmpdir(), "bl-cfg-data-"));
  process.env.BURNLESS_DB_DRIVER = "pglite";
  process.env.BURNLESS_DATA_DIR = dataDir;
  delete process.env.DATABASE_URL;
});
afterEach(async () => {
  await closeDatabase();
  rmSync(home, { recursive: true, force: true });
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.BURNLESS_DB_DRIVER;
  delete process.env.BURNLESS_DATA_DIR;
});

describe("runConfigSet / get / list / unset", () => {
  it("persists and reads back a normal key", async () => {
    await runConfigSet({ key: "BURNLESS_PORT", value: "2876", home });
    expect(runConfigGet({ key: "BURNLESS_PORT", home })).toBe("2876");
    expect(runConfigList({ home })).toMatchObject({ BURNLESS_PORT: "2876" });
    await runConfigUnset({ key: "BURNLESS_PORT", home });
    expect(runConfigGet({ key: "BURNLESS_PORT", home })).toBeUndefined();
  });
});

describe("claim-guard on disabling auto-login", () => {
  it("refuses BURNLESS_CAP_AUTO_LOGIN=off while the owner is unclaimed", async () => {
    await initDatabase();
    await createOwnerUserIfNone();
    await closeDatabase();
    await expect(
      runConfigSet({ key: "BURNLESS_CAP_AUTO_LOGIN", value: "off", home }),
    ).rejects.toThrow(/password/i);
  });

  it("allows it once the owner is claimed", async () => {
    await initDatabase();
    await createOwnerUserIfNone();
    await setUserPassword(LOCAL_OWNER_EMAIL, await hashPassword("pw"));
    await closeDatabase();
    await runConfigSet({ key: "BURNLESS_CAP_AUTO_LOGIN", value: "off", home });
    expect(runConfigGet({ key: "BURNLESS_CAP_AUTO_LOGIN", home })).toBe("off");
  });
});
