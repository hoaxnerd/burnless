import { mkdirSync, mkdtempSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runUpdate } from "../commands/update";

let home: string, vdir: string;
function fakeVersion(v: string) {
  const d = join(vdir, v); mkdirSync(d, { recursive: true });
  writeFileSync(join(d, ".burnless-artifact"), JSON.stringify({ version: v }));
}
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "burnless-upd-"));
  vdir = join(home, ".burnless", "versions"); mkdirSync(vdir, { recursive: true });
  fakeVersion("0.1.0"); symlinkSync("0.1.0", join(vdir, "current"));
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

describe("runUpdate", () => {
  it("flips current to the new version when the post-swap check passes", async () => {
    const r = await runUpdate({
      home, targetVersion: "0.2.0",
      ensureFn: async () => { fakeVersion("0.2.0"); },
      checkFn: async () => true,
    });
    expect(r.from).toBe("0.1.0"); expect(r.to).toBe("0.2.0"); expect(r.rolledBack).toBe(false);
    expect(readlinkSync(join(vdir, "current"))).toContain("0.2.0");
  });
  it("rolls the symlink back to the prior version when the post-swap check fails", async () => {
    const r = await runUpdate({
      home, targetVersion: "0.2.0",
      ensureFn: async () => { fakeVersion("0.2.0"); },
      checkFn: async () => false,
    });
    expect(r.rolledBack).toBe(true);
    expect(readlinkSync(join(vdir, "current"))).toContain("0.1.0");
  });
  it("no-ops when already at the target version", async () => {
    const r = await runUpdate({ home, targetVersion: "0.1.0", ensureFn: async () => {}, checkFn: async () => true });
    expect(r.noop).toBe(true);
  });
});
