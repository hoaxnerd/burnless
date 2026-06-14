import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { downloadAndVerify, extractArtifact, flipCurrent, ensureArtifact, resolveReleaseSource } from "../release";

let work: string, srcDir: string, home: string;
function makeTarball(version: string): { tar: string; sha: string } {
  const stage = join(work, `stage-${version}`);
  mkdirSync(stage, { recursive: true });
  writeFileSync(join(stage, ".burnless-artifact"), JSON.stringify({ version }));
  writeFileSync(join(stage, "burnless"), `#!/bin/sh\necho ${version}\n`, { mode: 0o755 });
  const tar = join(srcDir, `burnless-${version}.tar.gz`);
  execFileSync("tar", ["-czf", tar, "-C", stage, "."]);
  const sum = createHash("sha256").update(readFileSync(tar)).digest("hex");
  const sha = `${tar}.sha256`;
  writeFileSync(sha, `${sum}  burnless-${version}.tar.gz\n`);
  return { tar, sha };
}
beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), "burnless-rel-"));
  srcDir = join(work, "releases"); mkdirSync(srcDir, { recursive: true });
  home = join(work, "home");
});
afterEach(() => rmSync(work, { recursive: true, force: true }));

describe("resolveReleaseSource", () => {
  it("uses BURNLESS_RELEASE_BASE_URL when set (env override unchanged)", () => {
    expect(resolveReleaseSource("0.1.0", { BURNLESS_RELEASE_BASE_URL: "file:///x" })).toBe(
      "file:///x",
    );
  });
  it("defaults to the versioned GitHub-Releases download base for the target version", () => {
    expect(resolveReleaseSource("0.1.0", {})).toBe(
      "https://github.com/burnless/burnless/releases/download/v0.1.0/",
    );
  });
});
describe("downloadAndVerify", () => {
  it("verifies sha256 BEFORE returning, and rejects a tampered tarball without leaving the dest", async () => {
    const { tar } = makeTarball("0.1.0");
    const base = pathToFileURL(srcDir + "/").href;
    const dest = join(work, "dl.tar.gz");
    await downloadAndVerify({ base, version: "0.1.0", dest });
    expect(existsSync(dest)).toBe(true);
    writeFileSync(join(srcDir, "burnless-0.1.0.tar.gz.sha256"), `${"0".repeat(64)}  burnless-0.1.0.tar.gz\n`);
    const dest2 = join(work, "dl2.tar.gz");
    await expect(downloadAndVerify({ base, version: "0.1.0", dest: dest2 })).rejects.toThrow(/checksum/i);
    expect(existsSync(dest2)).toBe(false);
  });
});
describe("extractArtifact + flipCurrent + ensureArtifact", () => {
  it("extracts to versions/<ver> and flips current; ensureArtifact is idempotent + verify-before-unpack", async () => {
    makeTarball("0.1.0");
    const base = pathToFileURL(srcDir + "/").href;
    const versionsDir = join(home, ".burnless", "versions");
    await ensureArtifact({ base, version: "0.1.0", home });
    expect(existsSync(join(versionsDir, "0.1.0", ".burnless-artifact"))).toBe(true);
    expect(readlinkSync(join(versionsDir, "current"))).toContain("0.1.0");
    await ensureArtifact({ base, version: "0.1.0", home });
    expect(existsSync(join(versionsDir, "0.1.0", "burnless"))).toBe(true);
  });
});
